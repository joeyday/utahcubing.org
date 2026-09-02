// Regenerates assets/data/default.json and assets/data/championships.json.
//
// Stage 1: pull the full US competition list from the unofficial WCA API
// (https://wca-rest-api.robiningelbrecht.be) and keep only the ones organised
// by Utah Cubing Association, plus/minus the whitelist/blacklist overrides,
// plus a handful of "landmark" competitions (Rocky Mountain Championship, US
// Nationals, North American Championship, World Championship) that Utah
// cubers care about regardless of who organises them. That's default.json.
//
// Stage 2: pull the WCA's own list of championship-designated competitions
// (world + continental championships) and combine it with any US competition
// whose name reads as a CubingUSA regional championship, the same query the
// old site used (name matches /championship/i and /wca/i or /cubingusa/i).
// That's championships.json.
//
// Stage 3: for each competition landing in either file, hit the official WCA
// API to get registration dates and a live "spots left" count.
//
// Run via: node build/update-competitions.mjs

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')

const US_COMPETITIONS_URL = 'https://raw.githubusercontent.com/robiningelbrecht/wca-rest-api/refs/heads/v1/competitions/US.json'
const CHAMPIONSHIPS_URL = 'https://raw.githubusercontent.com/robiningelbrecht/wca-rest-api/refs/heads/v1/championships.json'
const OFFICIAL_API_BASE = 'https://www.worldcubeassociation.org/api/v0'
const ORGANISER_NAME = 'Utah Cubing Association'
const TIMEZONE = 'America/Denver'
const PAST_CUTOFF_DAYS = 60

// The WCA's own "championship" regions: the world championship plus one per
// continent. Anything tagged with one of these is a WCA major, wherever it's
// actually held.
const MAJOR_CHAMPIONSHIP_REGIONS = new Set([
    'world', 'africa', 'asia', 'europe', 'north-america', 'oceania', 'south-america',
])

// Landmark competitions Utah cubers care about even when Utah Cubing
// Association isn't the organiser. Matched by name, not id, since ids (and
// sponsor prefixes in names) drift year to year but these phrases don't.
const LANDMARK_NAME_PATTERNS = [
    /^(?:CubingUSA )?Rocky Mountain Championship \d{4}$/i,
    /^(?:CubingUSA Nationals|US Nationals|United States National Championships?) \d{4}$/i,
]

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
            from: competition.date.from,
            till: competition.date.till,
            venue: stripMarkdownLinks(competition.venue.name),
            city: competition.city,
            events: competition.events,
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

    const [{ items: usCompetitions }, { items: championshipCompetitions }] = await Promise.all([
        fetchJson(US_COMPETITIONS_URL),
        fetchJson(CHAMPIONSHIPS_URL),
    ])

    const today = toDenverDate(new Date())
    const cutoff = toDenverDate(new Date(Date.now() - PAST_CUTOFF_DAYS * 24 * 60 * 60 * 1000))

    const isCurrent = competition =>
        !competition.isCanceled && !blacklist.includes(competition.id) && competition.date.till >= cutoff

    const utahCompetitions = usCompetitions.filter(competition =>
        isCurrent(competition) &&
        (whitelist.includes(competition.id) ||
            competition.organisers.some(organiser => organiser.name === ORGANISER_NAME))
    )

    const landmarkCompetitions = usCompetitions.filter(competition =>
        isCurrent(competition) &&
        LANDMARK_NAME_PATTERNS.some(pattern => pattern.test(competition.name))
    )

    const majorChampionships = championshipCompetitions.filter(competition =>
        isCurrent(competition) && MAJOR_CHAMPIONSHIP_REGIONS.has(competition.region)
    )

    const worldAndNorthAmericanChampionships = majorChampionships.filter(competition =>
        competition.region === 'world' || competition.region === 'north-america'
    )

    const defaultResults = await buildResults(dedupeById([
        utahCompetitions,
        landmarkCompetitions,
        worldAndNorthAmericanChampionships,
    ]))
    writeCompetitionData('default.json', defaultResults)
    console.log(`Wrote ${defaultResults.length} competitions to default.json (today: ${today})`)

    // Same query the old site used: name reads as a championship, and either
    // "WCA" or "CubingUSA" is in the name.
    const cubingUsaRegionals = usCompetitions.filter(competition =>
        isCurrent(competition) &&
        /championship/i.test(competition.name) &&
        /cubingusa/i.test(competition.name)
    )

    const championshipsResults = await buildResults(dedupeById([
        majorChampionships,
        cubingUsaRegionals,
    ]))
    writeCompetitionData('championships.json', championshipsResults)
    console.log(`Wrote ${championshipsResults.length} competitions to championships.json (today: ${today})`)
}

main().catch(error => {
    console.error(error)
    process.exit(1)
})
