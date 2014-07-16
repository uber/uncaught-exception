uncaught-exception/uncaught := (options: {
    logger: {
        fatal: (String, Object, Callback) => void
    },
    prefix?: String,
    backupFile?: "stdout" | "stderr" | String,
    loggerTimeout?: Number,
    shutdownTimeout?: Number,
    gracefulShutdown?: (Callback) => void,
    preAbort?: () => void
}) => onError: (Error) => void
