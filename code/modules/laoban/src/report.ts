import {GenerationResult, streamName} from "./executors";
import * as fse from "fs-extra";
import {HasOutputStream, ScriptInContextAndDirectory} from "./config";
import {output} from "./utils";
import {Writable} from "stream";

function reporter(outputStream: Writable, gen: GenerationResult, reportDecorator: ReportDecorator): Promise<void> {
    let log = output({outputStream});
    let result = Promise.all(gen.map((sr, i) => {
        let logFile = streamName(sr.scd);
        return Promise.all(sr.scd.streams.map(s => new Promise<string>((resolve, reject) => {
            sr.scd.logStream.on('finish', () => resolve(logFile))
        }))).then(() => logFile)
    })).then(fileNames => fileNames.map(logFile => {
        if (gen.length > 0) {
            let report = {scd: gen[0].scd, text: fse.readFileSync(logFile).toString()}
            let message = reportDecorator(report).text;
            if (message.length > 0) log(message.trimRight())
        }
    }))
    gen.forEach(sr => sr.scd.streams.forEach(s => s.end()))
    return result.then(() => {})
}

interface Report {
    scd: ScriptInContextAndDirectory,
    text: string
}

type ReportDecorator = (report: Report) => Report

const prefixLinesThatDontStartWithStar = (s: string) => s.split('\n').map(s => s.startsWith('*') ? s : '        ' + s).join('\n');

const shellReportDecorator: ReportDecorator = report =>
    report.scd.scriptInContext.shell ?
        {...report, text: prefixLinesThatDontStartWithStar(report.text)} :
        report;

const quietDecorator: ReportDecorator = report => report.scd.scriptInContext.quiet ? {...report, text: ''} : report

function chainReports(decorators: ReportDecorator[]): ReportDecorator {return report => decorators.reduce((acc, r) => r(acc), report)}
const reportDecorators: ReportDecorator = chainReports([shellReportDecorator, quietDecorator])

export const shellReporter = (outputStream: Writable): (gen: GenerationResult) => Promise<void> =>
    gen => reporter(outputStream, gen, reportDecorators);