﻿using System;
using System.Collections.Generic;
using System.Net;
using System.Text;
using ServiceStack.Configuration;
using ServiceStack.Data;
using ServiceStack.DataAnnotations;
using ServiceStack.Host;
using ServiceStack.OrmLite;
using ServiceStack.Web;

namespace ServiceStack.Auth
{
    public class ApiKey : IMeta
    {
        [AutoIncrement]
        public int Id { get; set; }
        public string UserAuthId { get; set; }
        public string Environment { get; set; }
        public string KeyType { get; set; }

        [Index(Unique = true)]
        public string Key { get; set; }

        public DateTime CreatedDate { get; set; }
        public DateTime? ExpiryDate { get; set; }
        public DateTime? CancelledDate { get; set; }
        public string Notes { get; set; }

        //Custom Reference Data
        public int? RefId { get; set; }
        public string RefIdStr { get; set; }
        public Dictionary<string, string> Meta { get; set; }
    }

    public delegate string CreateApiKeyDelegate(string environment, string keyType, int keySizeBytes);

    public class ApiKeyAuthProvider : AuthProvider, IAuthWithRequest, IAuthPlugin
    {
        public const string Name = AuthenticateService.ApiKeyProvider;
        public const string Realm = "/auth/" + AuthenticateService.ApiKeyProvider;

        public static string[] DefaultTypes = new[] { "ApiKey" };
        public static string[] DefaultEnvironments = new[] { "Live", "Test" };
        public static int DefaultKeySizeBytes = 16;

        public int KeySizeBytes { get; set; }
        public string[] Environments { get; set; }
        public string[] KeyTypes { get; set; }
        public bool InitSchema { get; set; }
        public bool RequireSecureConnection { get; set; }

        public CreateApiKeyDelegate CreateApiKeyFn { get; set; }
        public Action<ApiKey> ApiKeyFilterFn { get; set; }

        public ApiKeyAuthProvider()
        {
            Init();
        }

        public ApiKeyAuthProvider(IAppSettings appSettings)
            : base(appSettings, Realm, Name)
        {
            Init(appSettings);
        }

        protected virtual void Init(IAppSettings appSettings = null)
        {
            InitSchema = true;
            RequireSecureConnection = true;
            Environments = DefaultEnvironments;
            KeyTypes = DefaultTypes;
            KeySizeBytes = DefaultKeySizeBytes;
            CreateApiKeyFn = CreateApiKey;

            if (appSettings != null)
            {
                InitSchema = appSettings.Get("apikey.InitSchema", true);
                RequireSecureConnection = appSettings.Get("apikey.RequireSecureConnection", true);

                var env = appSettings.GetString("apikey.Environments");
                if (env != null)
                    Environments = env.Split(ConfigUtils.ItemSeperator);

                var type = appSettings.GetString("apikey.KeyTypes");
                if (type != null)
                    KeyTypes = type.Split(ConfigUtils.ItemSeperator);

                var keySize = appSettings.GetString("apikey.KeySizeBytes");
                if (keySize != null)
                    KeySizeBytes = int.Parse(keySize);
            }
        }

        public virtual string CreateApiKey(string environment, string keyType, int sizeBytes)
        {
            return SessionExtensions.CreateRandomBase62Id(sizeBytes);
        }

        public override bool IsAuthorized(IAuthSession session, IAuthTokens tokens, Authenticate request = null)
        {
            return session != null && session.IsAuthenticated && !session.UserAuthName.IsNullOrEmpty();
        }

        public override object Authenticate(IServiceBase authService, IAuthSession session, Authenticate request)
        {
            var authRepo = authService.TryResolve<IAuthRepository>().AsUserAuthRepository(authService.GetResolver());

            using (var db = HostContext.AppHost.GetDbConnection(authService.Request))
            {
                var apiKey = db.Single<ApiKey>(x => x.Key == request.Password);
                if (apiKey == null)
                    throw HttpError.NotFound("ApiKey does not exist");

                if (apiKey.CancelledDate != null)
                    throw HttpError.Forbidden("ApiKey has been cancelled");

                if (apiKey.ExpiryDate != null && DateTime.UtcNow > apiKey.ExpiryDate.Value)
                    throw HttpError.Forbidden("ApiKey has expired");

                var userAuth = authRepo.GetUserAuth(apiKey.UserAuthId);
                if (userAuth == null)
                    throw HttpError.Unauthorized("User for ApiKey does not exist");

                if (IsAccountLocked(authRepo, userAuth))
                    throw new AuthenticationException(ErrorMessages.UserAccountLocked);

                PopulateSession(authRepo, userAuth, session);

                if (session.UserAuthName == null)
                    session.UserAuthName = userAuth.UserName ?? userAuth.Email;

                var response = OnAuthenticated(authService, session, null, null);
                if (response != null)
                    return response;

                authService.Request.Items[Keywords.ApiKey] = apiKey;

                return new AuthenticateResponse
                {
                    UserId = session.UserAuthId,
                    UserName = session.UserName,
                    SessionId = session.Id,
                    DisplayName = session.DisplayName
                        ?? session.UserName
                        ?? "{0} {1}".Fmt(session.FirstName, session.LastName).Trim(),
                    ReferrerUrl = request.Continue,
                };
            }
        }

        public void PreAuthenticate(IRequest req, IResponse res)
        {
            //The API Key is sent in the Basic Auth Username and Password is Empty
            var userPass = req.GetBasicAuthUserAndPassword();
            if (userPass != null && string.IsNullOrEmpty(userPass.Value.Value))
            {
                if (RequireSecureConnection && !req.IsSecureConnection)
                    throw HttpError.Forbidden(ErrorMessages.ApiKeyRequiresSecureConnection);

                //Need to run SessionFeature filter since its not executed before this attribute (Priority -100)			
                SessionFeature.AddSessionIdToRequestFilter(req, res, null); //Required to get req.GetSessionId()

                using (var authService = req.TryResolve<AuthenticateService>())
                {
                    authService.Request = req;
                    var apiKey = userPass.Value.Key;
                    var response = authService.Post(new Authenticate
                    {
                        provider = Name,
                        UserName = "ApiKey",
                        Password = apiKey,
                    });
                }
            }
        }

        public void Register(IAppHost appHost, AuthFeature feature)
        {
            feature.AuthEvents.Add(new ApiKeyAuthEvents(this));

            if (InitSchema)
            {
                var dbFactory = appHost.TryResolve<IDbConnectionFactory>();

                if (dbFactory == null)
                    throw new NotSupportedException("ApiKeyAuthProvider requires a registered OrmLite IDbConnectionFactory");

                using (var db = dbFactory.OpenDbConnection())
                {
                    db.CreateTableIfNotExists<ApiKey>();
                }
            }
        }

        public override void OnFailedAuthentication(IAuthSession session, IRequest httpReq, IResponse httpRes)
        {
            httpRes.StatusCode = (int)HttpStatusCode.Unauthorized;
            //Needs to be 'Basic ' in order for HttpWebRequest to accept challenge and send NetworkCredentials
            httpRes.AddHeader(HttpHeaders.WwwAuthenticate, "Basic realm=\"{0}\"".Fmt(this.AuthRealm));
            httpRes.EndRequest();
        }
    }

    internal class ApiKeyAuthEvents : AuthEvents
    {
        private readonly ApiKeyAuthProvider apiKeyProvider;

        public ApiKeyAuthEvents(ApiKeyAuthProvider apiKeyProvider)
        {
            this.apiKeyProvider = apiKeyProvider;
        }

        public override void OnRegistered(IRequest httpReq, IAuthSession session, IServiceBase registrationService)
        {
            var now = DateTime.UtcNow;
            var userId = session.UserAuthId;
            var apiKeys = new List<ApiKey>();

            foreach (var env in apiKeyProvider.Environments)
            {
                foreach (var keyType in apiKeyProvider.KeyTypes)
                {
                    var key = apiKeyProvider.CreateApiKeyFn(env, keyType, apiKeyProvider.KeySizeBytes);

                    var apiKey = new ApiKey
                    {
                        UserAuthId = userId,
                        Environment = env,
                        KeyType = keyType,
                        Key = key,
                        CreatedDate = now,
                    };

                    if (apiKeyProvider.ApiKeyFilterFn != null)
                        apiKeyProvider.ApiKeyFilterFn(apiKey);

                    apiKeys.Add(apiKey);
                }
            }

            using (var db = HostContext.AppHost.GetDbConnection(httpReq))
            {
                db.InsertAll(apiKeys);
            }
        }
    }

}