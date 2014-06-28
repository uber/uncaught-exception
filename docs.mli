rt-uncaught-exception/uncaught := (opts?: {
    scope: String,
    crashOnException: Boolean,
    logger?: WinstonLogger,
    verbose?: Boolean,
    serviceName?: String
}) => onError: (Error) => void
