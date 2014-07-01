module.exports = tryCatch;

function tryCatch(fn) {
    var tuple = [null, undefined];

    try {
        tuple[1] = fn();
    } catch (error) {
        tuple[0] = error;
    }

    return tuple;
}
