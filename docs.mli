uncaught-exception/uncaught := (options: {
    logger: {
        fatal: (String, Object, Callback) => void
    },
    statsd: {
        immediateIncrement: (String, Number, Callback) =>void
    },
    meta?: Object,
    statsdKey?: String,
    statsdWaitPeriod?: Number,
    backupFile?: "stdout" | "stderr" | String,
    abortOnUncaught?: Boolean,
    loggerTimeout?: Number,
    statsdTimeout?: Number,
    shutdownTimeout?: Number,
    gracefulShutdown?: (Callback) => void,
    preAbort?: () => void
}) => onError: (Error) => void
