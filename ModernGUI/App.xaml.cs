using System.IO;
using System.Windows;
using Autofac;
using log4net;
using CKAN.GUI.Services;

namespace CKAN.GUI;

public partial class App : Application
{
    private static readonly ILog Log = LogManager.GetLogger(typeof(App));

    public static IContainer? Container { get; private set; }

    protected override void OnStartup(StartupEventArgs e)
    {
        // Set up logging
        var logRepository = log4net.LogManager.GetRepository(Assembly.GetExecutingAssembly());
        var logConfig = new FileInfo(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "log4net.xml"));
        if (logConfig.Exists)
        {
            log4net.Config.XmlConfigurator.Configure(logRepository, logConfig);
        }

        Log.Info("CKAN Modern GUI starting...");

        // Set up global exception handlers
        AppDomain.CurrentDomain.UnhandledException += OnUnhandledException;
        DispatcherUnhandledException += OnDispatcherUnhandledException;
        TaskScheduler.UnobservedTaskException += OnUnobservedTaskException;

        base.OnStartup(e);

        // Build dependency injection container
        var builder = new ContainerBuilder();
        builder.RegisterModule<ServiceModule>();
        Container = builder.Build();

        Log.Info("CKAN Modern GUI started successfully");
    }

    private void OnUnhandledException(object sender, UnhandledExceptionEventArgs e)
    {
        var ex = e.ExceptionObject as Exception;
        Log.Fatal("Unhandled exception in AppDomain", ex);
        MessageBox.Show($"A fatal error occurred:\n{ex?.Message}", "CKAN Error",
            MessageBoxButton.OK, MessageBoxImage.Error);
    }

    private void OnDispatcherUnhandledException(object sender, System.Windows.Threading.DispatcherUnhandledExceptionEventArgs e)
    {
        Log.Error("Unhandled exception in Dispatcher", e.Exception);
        MessageBox.Show($"An error occurred:\n{e.Exception.Message}", "CKAN Error",
            MessageBoxButton.OK, MessageBoxImage.Warning);
        e.Handled = true;
    }

    private void OnUnobservedTaskException(object? sender, UnobservedTaskExceptionEventArgs e)
    {
        Log.Error("Unobserved task exception", e.Exception);
        e.SetObserved();
    }

    protected override void OnExit(ExitEventArgs e)
    {
        Log.Info("CKAN Modern GUI shutting down...");
        Container?.Dispose();
        base.OnExit(e);
    }
}