import * as cp from 'child_process'
import {ExecException} from 'child_process'
import {CommandDefn, Envs, ProjectDetailsAndDirectory, ScriptInContext, ScriptInContextAndDirectory} from "./config";
import {cleanUpEnv, derefence} from "./configProcessor";
import * as path from "path";
import {Promise} from "core-js";

export interface RawShellResult {
    err: ExecException | null,
    stdout: string,
    stderr: string
}
export interface ShellResult {
    details: CommandDetails
    duration: number,
    err: ExecException | null,
    stdout: string,
    stderr: string
}

export interface ScriptResult {
    scd: ScriptInContextAndDirectory,
    results: ShellResult[],
    duration: number
}

export type  Generation = ScriptInContextAndDirectory[]
export type  Generations = Generation[]
export type GenerationsResult = ScriptResult[][]
export type GenerationResult = ScriptResult[]


export interface ShellCommandDetails<Cmd> {
    scd: ScriptInContextAndDirectory,
    details: Cmd,
}

export interface CommandDetails {
    command: CommandDefn,
    dic: any, //All the things that can be used to deference variables
    env: Envs //The envs with their variables dereferenced
    directory: string, // the actual directory that the command will be executed in
    commandString: string,
}

function calculateDirectory(directory: string, command: CommandDefn) { return (command.directory) ? path.join(directory, command.directory) : directory;}

export function buildShellCommandDetails(scd: ScriptInContextAndDirectory): ShellCommandDetails<CommandDetails>[] {
    // console.log('buildShellCommandDetails - 0')
    // console.log('buildShellCommandDetails - 0a')
    let result = scd.scriptInContext.details.commands.map(cmd => {
        // console.log('buildShellCommandDetails - 1')
        let directory = calculateDirectory(scd.detailsAndDirectory.directory, cmd)
        // console.log('buildShellCommandDetails - 2')
        let dic = {...scd.scriptInContext.config, projectDirectory: scd.detailsAndDirectory.directory, projectDetails: scd.detailsAndDirectory.projectDetails}
        // console.log('buildShellCommandDetails - 3')
        let result: ShellCommandDetails<CommandDetails> = {
            scd: scd,
            details: ({
                command: cmd,
                commandString: derefence(dic, cmd.command),
                dic: dic,
                env: cleanUpEnv(dic, scd.scriptInContext.details.env),
                directory: derefence(dic, directory),
            })
        };
        // console.log('buildShellCommandDetails - 4')
        return result
    });
    // console.log('buildShellCommandDetails - 5')
    return result
}

export function addDirectoryDetailsToCommands(details: ProjectDetailsAndDirectory, sc: ScriptInContext): ScriptInContextAndDirectory { return ({detailsAndDirectory: details, scriptInContext: sc});}


export let executeOneGeneration: (e: ExecuteOneScript) => ExecuteOneGeneration = e => gen => {
    // console.log('executeOneGeneration', e, gen)
    return Promise.all(gen.map(x => e(x)))
}

export function executeAllGenerations(executeOne: ExecuteOneGeneration, reporter: (GenerationResult) => void): ExecuteGenerations {
    let fn = (gs, sofar) => {
        // console.log('  fn', gs, sofar)
        if (gs.length == 0) return Promise.resolve(sofar)
        return executeOne(gs[0]).then(gen0Res => {
            reporter(gen0Res)
            return fn(gs.slice(1), [...sofar, gen0Res])
        })

    }
    // console.log('executeAllGenerations zero')
    return gs => {
        // console.log('executeAllGenerations one', gs)
        return fn(gs, [])
    }
}

export let executeScript: (e: ExecuteOne) => ExecuteOneScript = e => (scd: ScriptInContextAndDirectory) => {
    // console.log('execute script', e,scd)
    // console.log('execute script', e, scd.detailsAndDirectory.directory, scd.scriptInContext.details.name)
    let startTime = new Date().getTime()
    return executeOneAfterTheOther(e)(buildShellCommandDetails(scd)).then(results => ({results, scd, duration: new Date().getTime() - startTime}))
}

function executeOneAfterTheOther<From, To>(fn: (from: From) => Promise<To>): (froms: From[]) => Promise<To[]> {
    // console.log('executeOneAfterTheOther - 0', fn)
    return froms => {
        // console.log('executeOneAfterTheOther - 1', fn, froms)
        return froms.reduce((res, f) => res.then(r => {
            // console.log('executeOneAfterTheOther - 2', fn, f)
            return fn(f).then(to => [...r, to])
        }), Promise.resolve([]))
    }
}


export type RawExecutor = (d: ShellCommandDetails<CommandDetails>) => Promise<RawShellResult>
export type ExecuteOne = (d: ShellCommandDetails<CommandDetails>) => Promise<ShellResult>

export type ExecuteGenerations = (generations: Generations) => Promise<GenerationsResult>
export type ExecuteOneGeneration = (generation: Generation) => Promise<GenerationResult>
export type ExecuteOneScript = (s: ScriptInContextAndDirectory) => Promise<ScriptResult>

export type ExecutorDecorator = (e: ExecuteOne) => ExecuteOne
export type AppendToFileIf = (condition: any | undefined, name: string, content: string) => Promise<void>
type Finder = (c: ShellCommandDetails<CommandDetails>) => ExecuteOne

interface ToFileDecorator {
    appendCondition: (d: ShellCommandDetails<CommandDetails>) => any | undefined
    filename: (d: ShellCommandDetails<CommandDetails>) => string
    content: (d: ShellCommandDetails<CommandDetails>, res: ShellResult) => string
}

const shouldAppend = (d: ShellCommandDetails<CommandDetails>) => !d.scd.scriptInContext.dryrun;
const dryRunContents = (d: ShellCommandDetails<CommandDetails>) => `${d.details.directory} ${d.details.commandString}`;

export function consoleOutputFor(d: ShellCommandDetails<CommandDetails>, res: ShellResult): string {
    let errorString = res.err ? `***Error***${res.err}\n` : ""
    let stdErrString = res.stderr.length > 0 ? `***StdError***${res.stderr}\n` : ""
    return `${errorString}${stdErrString}${res.stdout}`
}


export function chain(executors: ExecutorDecorator[]): ExecutorDecorator {return raw => executors.reduce((acc, v) => v(acc), raw)}

export class ExecutorDecorators {

    static normalDecorator(a: AppendToFileIf): ExecutorDecorator {
        return chain([ExecutorDecorators.dryRun, ...[ExecutorDecorators.status, ExecutorDecorators.profile, ExecutorDecorators.log].map(ExecutorDecorators.decorate(a))])
    }

    static decorate: (a: AppendToFileIf) => (fileDecorator: ToFileDecorator) => ExecutorDecorator = appendIf => dec => e =>
        d => e(d).then(res => appendIf(dec.appendCondition(d) && shouldAppend(d), dec.filename(d), dec.content(d, res)).then(() => res))


    static status: ToFileDecorator = {
        appendCondition: d => d.details.command.status,
        filename: d => path.join(d.scd.detailsAndDirectory.directory, d.scd.scriptInContext.config.status),
        content: (d, res) => `${d.scd.scriptInContext.timestamp} ${d.details.command.name} ${res.err !== null}\n`
    }
    static profile: ToFileDecorator = {
        appendCondition: d => d.details.command.name,
        filename: d => path.join(d.scd.detailsAndDirectory.directory, d.scd.scriptInContext.config.profile),
        content: (d, res) => `${d.scd.scriptInContext.details.name} ${d.details.command.name}  ${res.duration}\n`
    }
    static log: ToFileDecorator = {
        appendCondition: d => true,
        filename: d => path.join(d.scd.detailsAndDirectory.directory, d.scd.scriptInContext.config.log),
        content: (d, res) => `${d.scd.scriptInContext.timestamp} ${d.details.command.name}\n${res.stdout}\nTook ${res.duration}\n\n`
    }

    static dryRun: ExecutorDecorator = e => d => d.scd.scriptInContext.dryrun ? Promise.resolve({duration: 0, details: d.details, stdout: dryRunContents(d), err: null, stderr: ""}) : e(d)


}


function jsOrShellFinder(js: ExecuteOne, shell: ExecuteOne): Finder {
    return c => (c.details.commandString.startsWith('js:')) ? js : shell

}
export function timeIt(e: RawExecutor): ExecuteOne {
    return d => {
        let startTime = new Date()
        return e(d).then(res => ({...res, details: d.details, duration: (new Date().getTime() - startTime.getTime())}));
    }
}

export function defaultExecutor(a: AppendToFileIf) { return make(execInShell, execJS, timeIt, ExecutorDecorators.normalDecorator(a))}

export function make(shell: RawExecutor, js: RawExecutor, timeIt: (e: RawExecutor) => ExecuteOne, ...decorators: ExecutorDecorator[]): ExecuteOne {
    let decorate = chain(decorators)
    let decoratedShell = decorate(timeIt(shell))
    let decoratedJs = decorate(timeIt(js))
    let finder = jsOrShellFinder(decoratedJs, decoratedShell)
    return c => finder(c)(c)
}

export let execInShell: RawExecutor = d => {
    let options = d.details.env ? {cwd: d.details.directory, env: {...process.env, ...d.details.env}} : {cwd: d.details.directory}
    return new Promise<RawShellResult>((resolve, reject) =>
        cp.exec(d.details.commandString, options, (err: any, stdout: string, stderr: string) =>
            resolve({err: err, stdout: stdout.trimRight(), stderr: stderr})))
}

//** The function passed in should probably not return a promise. The directory is changed, the function executed and then the directory is changed back
function executeInChangedDir<To>(dir: string, block: () => To): To {
    let oldDir = process.cwd()
    try {
        process.chdir(dir);
        return block()
    } finally {process.chdir(oldDir)}
}
//** The function passed in should probably not return a promise. The env is changed, the function executed and then the env changed back
function executeInChangedEnv<To>(env: Envs, block: () => To): To {
    let oldEnv = process.env
    try {
        if (env) process.env = env;
        return block()
    } finally {process.env = oldEnv}
}


let execJS: RawExecutor = d => {
    try {
        let res = executeInChangedEnv<any>(d.details.env, () => executeInChangedDir(d.details.directory,
            () => Function("return  " + d.details.commandString.substring(3))().toString()))
        return Promise.resolve({err: null, stdout: res.toString(), stderr: ""})
    } catch (e) {
        return Promise.resolve({err: e, stdout: `Error: ${e} Command was [${d.details.commandString}]`, stderr: ""})
    }
}