import {HasOutputStream, ProjectDetailsAndDirectory, ScriptInContextAndDirectory} from "./config";
import {output} from "./utils";

interface Tree {
    [name: string]: Set<string>
}

interface GenerationCalc {
    existing: string[],
    generations: string[][]
}
interface Generations {
    generations: ProjectDetailsAndDirectory[][],
    errors?: string
}

export function calculateAllGenerations(scds: ScriptInContextAndDirectory[]) {
    return calcAllGenerationRecurse(scds, {existing: [], generations: []})
}

export function splitGenerationsByLinks(scds: ScriptInContextAndDirectory[]): ScriptInContextAndDirectory[][] {
    let map = new Map<string, ScriptInContextAndDirectory>()
    function debug(msg: () => any[]) {
        if (scds.length > 0)
            scds[0].scriptInContext.debug('scripts').message(msg)
    }
    scds.forEach(scd => {
        let projectDetails = scd.detailsAndDirectory.projectDetails;
        if (!projectDetails) throw new Error(`Cannot calculate generations as we have a directory without project.details.json [${scd.detailsAndDirectory.directory}]`)
        map.set(projectDetails.name, scd)
    })
    debug(() => ['keys in the map of names to projects', [...map.keys()].sort()])
    if (scds.length !== map.size)
        throw new Error(`Cannot calculate generations: multiple projects with the same name
        ${scds.map(scd => `${scd.detailsAndDirectory.directory} => ${scd.detailsAndDirectory.projectDetails.name}`).join(', ')}`);
    if (scds.length !== map.size) throw new Error('Cannot calculate generations: multiple projects with the same name')
    let genNames = calculateAllGenerations(scds).generations
    debug(() => ['genNames', ...genNames])
    return genNames.map(names => names.map(n => map.get(n)))

}

export function calcAllGenerationRecurse(scds: ScriptInContextAndDirectory[], start: GenerationCalc): GenerationCalc {
    let newGen = getChildrenRecurse(scds, start.existing)
    if (newGen.length == 0) return start;
    return calcAllGenerationRecurse(scds, {existing: [...start.existing, ...newGen], generations: [...start.generations, newGen]})
}
export function prettyPrintGenerations(hasStream: HasOutputStream, scds: ScriptInContextAndDirectory[], gen: GenerationCalc) {
    let log = output(hasStream)
    gen.generations.forEach((g, i) => {
        log(`Generation ${i}`)
        log('  ' + g.join(", "))
    })
    let thisTree = {}
    let missing = new Set(scds.map(p => p.detailsAndDirectory.projectDetails.name))
    gen.generations.forEach(g => g.forEach(n => missing.delete(n)))
    if (missing.size > 0) {
        log('')
        log("Missing: can't put in a generation")
        log('  ' + [...missing].sort().join(","))
    }
}

function getChildrenRecurse(pds: ScriptInContextAndDirectory[], existing: string[]) {
    let thisTree = {}
    pds.forEach(p => thisTree[p.detailsAndDirectory.projectDetails.name] = new Set(p.detailsAndDirectory.projectDetails.details.links))
    for (let k in thisTree) {
        if (existing.includes(k)) delete thisTree[k]
        else {
            let values = thisTree[k]
            existing.forEach(e => values.delete(e))
        }
    }
    for (let k in thisTree) {
        if (thisTree[k].size > 0)
            delete thisTree[k]
    }
    return [...Object.keys(thisTree)].sort()
}
