// Regenerates assets/data/default.json and assets/data/championships.json,
// pulling everything from the official WCA API.
//
// Stage 1: fetch every competition worldwide from PAST_CUTOFF_DAYS ago
// onward (no upper bound - competitions aren't announced far enough in
// advance for that to matter). The official API has no server-side filter
// for organiser name or championship designation, so whatever we want by
// name or by organiser has to be pulled down and filtered here in memory.
// One worldwide pass covers everything both output files need, since a
// Utah-scoped query would just be a subset of it.
//
// Stage 2: from that one list, pick out:
//   - default.json: competitions organised by Utah Cubing Association
//     (plus whitelist/blacklist overrides), plus a handful of "landmark"
//     competitions (Rocky Mountain Championship, US Nationals, North
//     American Championship, World Championship) that Utah cubers care
//     about regardless of who organises them.
//   - championships.json: world + continental championships, plus any US
//     competition whose name reads as a CubingUSA regional championship.
//     This one is a personal travel-planning list, not a site feature -
//     it's not linked anywhere in the UI, and deliberately excludes
//     state-level championships (e.g. "Idaho Championship").
//
// Stage 3: for each competition landing in either file, hit the official
// WCA API again to get registration dates and a live "spots left" count.
//
// Run via: node build/update-competitions.mjs

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')

const OFFICIAL_API_BASE = 'https://www.worldcubeassociation.org/api/v0'
const ORGANISER_NAME = 'Utah Cubing Association'
const TIMEZONE = 'America/Denver'
const PAST_CUTOFF_DAYS = 60
const PER_PAGE = 500

// Landmark competitions Utah cubers care about even when Utah Cubing
// Association isn't the organiser. Matched by name, not id, since ids (and
// sponsor prefixes in names) drift year to year but these phrases don't.
const LANDMARK_NAME_PATTERNS = [
    /^(?:CubingUSA )?Rocky Mountain Championship \d{4}$/i,
    /^(?:CubingUSA Nationals|US Nationals|United States National Championships?) \d{4}$/i,
    /\bWCA World Championship \d{4}$/i,
    /\bWCA North American Championship \d{4}$/i,
]

// World + continental championships, wherever they're held and whoever
// sponsors them (sponsor names like "Rubik's" or "GAN" show up as a prefix
// and drift year to year, so this only anchors on the "WCA ... Championship
// YYYY" part of the name). FMC-only continental championships put "FMC"
// before or after "Championship" depending on the year, so both orderings
// are allowed.
const MAJOR_CHAMPIONSHIP_NAME_PATTERN =
    /\bWCA (World|North American|European|Asian|African|Oceanic|South American)(?: FMC)? Championship(?: FMC)? \d{4}$/i

function readIdList(filename) {
    const contents = readFileSync(path.join(root, 'build', filename), 'utf8')
    return contents
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.startsWith('-'))
        .map(line => line.slice(1).trim())
        .filter(Boolean)
}

function toDenverDate(date) {
    return date.toLocaleDateString('en-CA', { timeZone: TIMEZONE })
}

function stripMarkdownLinks(text) {
    return text.replace(/\[|\]|\(.*?\)/g, '')
}

async function fetchJson(url) {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`${response.status} ${response.statusText} fetching ${url}`)
    return response.json()
}

async function fetchAllCompetitionsSince(sinceDate) {
    const results = []
    let page = 1

    while (true) {
        const url = `${OFFICIAL_API_BASE}/competitions?start=${sinceDate}&per_page=${PER_PAGE}&page=${page}`
        const batch = await fetchJson(url)
        results.push(...batch)
        if (batch.length < PER_PAGE) break
        page += 1
    }

    return results
}

async function fetchRegistrationInfo(id) {
    const info = {}

    const competition = await fetchJson(`${OFFICIAL_API_BASE}/competitions/${id}`)
    if (competition.registration_open) info.registration_opens = competition.registration_open
    if (competition.registration_close) info.registration_closes = competition.registration_close

    if (competition.competitor_limit) {
        const wcif = await fetchJson(`${OFFICIAL_API_BASE}/competitions/${id}/wcif/public`)
        const accepted = wcif.persons.filter(person =>
            person.registration?.status === 'accepted' && person.registration?.isCompeting !== false
        ).length
        info.spots_left = competition.competitor_limit - accepted
    }

    return info
}

function dedupeById(competitionLists) {
    const byId = new Map()
    for (const competition of competitionLists.flat()) {
        byId.set(competition.id, competition)
    }
    return [...byId.values()]
}

async function buildResults(competitions) {
    const results = []

    for (const competition of competitions) {
        const entry = {
            id: competition.id,
            name: competition.name,
            from: competition.start_date,
            till: competition.end_date,
            venue: stripMarkdownLinks(competition.venue),
            city: competition.city,
            events: competition.event_ids,
        }

        try {
            Object.assign(entry, await fetchRegistrationInfo(competition.id))
        } catch (error) {
            console.warn(`Could not fetch registration info for ${competition.id}: ${error.message}`)
        }

        results.push(entry)
    }

    results.sort((a, b) => a.from < b.from ? -1 : a.from > b.from ? 1 : a.name.localeCompare(b.name))
    return results
}

function writeCompetitionData(filename, results) {
    const output = {
        generated_at: new Date().toISOString(),
        items: results,
    }

    writeFileSync(
        path.join(root, 'assets', 'data', filename),
        JSON.stringify(output, null, 4) + '\n'
    )
}

async function main() {
    const whitelist = readIdList('whitelist.yml')
    const blacklist = readIdList('blacklist.yml')

    const cutoff = toDenverDate(new Date(Date.now() - PAST_CUTOFF_DAYS * 24 * 60 * 60 * 1000))

    const allCompetitions = await fetchAllCompetitionsSince(cutoff)

    const isCurrent = competition =>
        !competition.cancelled_at && !blacklist.includes(competition.id) && competition.end_date >= cutoff

    const utahCompetitions = allCompetitions.filter(competition =>
        isCurrent(competition) &&
        (whitelist.includes(competition.id) ||
            competition.organizers.some(organiser => organiser.name === ORGANISER_NAME))
    )

    const landmarkCompetitions = allCompetitions.filter(competition =>
        isCurrent(competition) &&
        LANDMARK_NAME_PATTERNS.some(pattern => pattern.test(competition.name))
    )

    const defaultResults = await buildResults(dedupeById([
        utahCompetitions,
        landmarkCompetitions,
    ]))
    writeCompetitionData('default.json', defaultResults)
    console.log(`Wrote ${defaultResults.length} competitions to default.json (cutoff: ${cutoff})`)

    const majorChampionships = allCompetitions.filter(competition =>
        isCurrent(competition) && MAJOR_CHAMPIONSHIP_NAME_PATTERN.test(competition.name)
    )

    // Same query the old site used: US, name reads as a championship, and
    // "CubingUSA" is in the name.
    const cubingUsaRegionals = allCompetitions.filter(competition =>
        isCurrent(competition) &&
        competition.country_iso2 === 'US' &&
        /championship/i.test(competition.name) &&
        /cubingusa/i.test(competition.name)
    )

    const championshipsResults = await buildResults(dedupeById([
        majorChampionships,
        cubingUsaRegionals,
    ]))
    writeCompetitionData('championships.json', championshipsResults)
    console.log(`Wrote ${championshipsResults.length} competitions to championships.json (cutoff: ${cutoff})`)
}

main().catch(error => {
    console.error(error)
    process.exit(1)
})
