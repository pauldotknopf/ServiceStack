using System.Data;
using MyApp.ServiceModel;
using ServiceStack;
using ServiceStack.OrmLite;

namespace MyApp.ServiceInterface;

public class MyCommands
{
    [Command<AddTodoCommand>]
    public CreateTodo? CreateTodo { get; set; }

    [Command<ThrowExceptionCommand>]
    public ThrowException? ThrowException { get; set; }

    [Command<ThrowExceptionCommand>]
    public ThrowException? ThrowArgumentException { get; set; }

    [Command<ThrowExceptionCommand>]
    public ThrowException? ThrowNotSupportedException { get; set; }
}

public class AddTodoCommand(IDbConnection db) : IAsyncCommand<CreateTodo>
{
    public async Task ExecuteAsync(CreateTodo request)
    {
        var newTodo = request.ConvertTo<Todo>();
        await db.InsertAsync(newTodo);
    }
}

public record ThrowException(string Type, string Message, string? Param=null);

public class ThrowExceptionCommand : IAsyncCommand<ThrowException>
{
    public Task ExecuteAsync(ThrowException request)
    {
        throw request.Type switch {
            nameof(ArgumentException) => new ArgumentException(request.Message),
            nameof(ArgumentNullException) => new ArgumentNullException(request.Message),
            nameof(NotSupportedException) => new NotSupportedException(request.Message),
            _ => new Exception(request.Message) 
        };
    }
}

public class MyCommandsServices(ICommandExecutor executor) : Service
{
    public async Task<object> Any(CommandOperation request)
    {
        var commands = new MyCommands();

        if (request.NewTodo != null)
            commands.CreateTodo = new() { Text = request.NewTodo };
        if (request.ThrowException != null)
            commands.ThrowException = new(nameof(Exception), request.ThrowException);
        if (request.ThrowArgumentException != null)
            commands.ThrowArgumentException = new(nameof(ArgumentException), request.ThrowArgumentException);
        if (request.ThrowNotSupportedException != null)
            commands.ThrowNotSupportedException = new(nameof(NotSupportedException), request.ThrowNotSupportedException);

        await Request.ExecuteCommandsAsync(commands);

        return new EmptyResponse();
    }
}