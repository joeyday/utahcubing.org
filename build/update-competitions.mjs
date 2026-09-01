// Regenerates assets/data/competitions.json.
//
// Stage 1: pull the full US competition list from the unofficial WCA API
// (https://wca-rest-api.robiningelbrecht.be) and keep only the ones organised
// by Utah Cubing Association, plus/minus the whitelist/blacklist overrides.
//
// Stage 2: for each of those, hit the official WCA API to get registration
// dates and a live "spots left" count.
//
// Run via: node build/update-competitions.mjs

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')

const UNOFFICIAL_API_URL = 'https://raw.githubusercontent.com/robiningelbrecht/wca-rest-api/refs/heads/v1/competitions/US.json'
const OFFICIAL_API_BASE = 'https://www.worldcubeassociation.org/api/v0'
const ORGANISER_NAME = 'Utah Cubing Association'
const TIMEZONE = 'America/Denver'
const PAST_CUTOFF_DAYS = 60

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

async function main() {
    const whitelist = readIdList('whitelist.yml')
    const blacklist = readIdList('blacklist.yml')

    const { items } = await fetchJson(UNOFFICIAL_API_URL)

    const today = toDenverDate(new Date())
    const cutoff = toDenverDate(new Date(Date.now() - PAST_CUTOFF_DAYS * 24 * 60 * 60 * 1000))

    const matched = items.filter(competition => {
        if (competition.isCanceled) return false
        if (blacklist.includes(competition.id)) return false
        if (competition.date.till < cutoff) return false
        return whitelist.includes(competition.id) ||
            competition.organisers.some(organiser => organiser.name === ORGANISER_NAME)
    })

    const results = []
    for (const competition of matched) {
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

    const output = {
        generated_at: new Date().toISOString(),
        items: results,
    }

    writeFileSync(
        path.join(root, 'assets', 'data', 'competitions.json'),
        JSON.stringify(output, null, 4) + '\n'
    )

    console.log(`Wrote ${results.length} competitions (today: ${today})`)
}

main().catch(error => {
    console.error(error)
    process.exit(1)
})
