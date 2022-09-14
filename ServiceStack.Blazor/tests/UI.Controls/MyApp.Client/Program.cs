using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Web;
using MyApp;
using MyApp.Client;
using MyApp.Client.Components;
using MyApp.Client.Data;
using ServiceStack;
using ServiceStack.Blazor;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddRazorPages();
builder.Services.AddServerSideBlazor();
builder.Services.AddSingleton<WeatherForecastService>();
builder.Services.AddScoped<LocalStorage>();
builder.Services.AddBlazorApiClient(builder.Configuration["ApiBaseUrl"] ?? "https://localhost:7142/"); // builder.HostEnvironment.BaseAddress);

var app = builder.Build();

// Configure the HTTP request pipeline.
if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error");
    // The default HSTS value is 30 days. You may want to change this for production scenarios, see https://aka.ms/aspnetcore-hsts.
    app.UseHsts();
}

app.UseHttpsRedirection();

app.UseStaticFiles();

app.UseRouting();

app.MapBlazorHub();
app.MapFallbackToPage("/_Host");

app.UseServiceStack(new AppHost());

BlazorConfig.EnableVerboseLogging = true;

app.Run();