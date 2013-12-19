rt-uncaught-exception/domain := createDomain: (opts?: { 
    tryCatch?: Boolean 
}) => (
    emitters: Array<EventEmitter>,
    handleError: (Error, Domain) => void,
    onRun: Function
) => void

rt-uncaught-exception/uncaught := (opts?: {
    scope: String,
    crashOnException: Boolean,
    logger?: WinstonLogger,
    verbose?: Boolean,
    serviceName?: String
}) => onError: (Error) => void
