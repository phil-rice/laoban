export class Debug {
    private options: Set<string>;
    private printer: (msg: string) => void;
    constructor(debugString: string | undefined, printer: (msg: string) => void) {
        this.options = new Set(debugString ? debugString.split(',') : [])
        this.printer = printer;
    }

    debug(option: string, fn: () => string) {
        if (this.options.has(option)) this.printer(fn())
    }
}
