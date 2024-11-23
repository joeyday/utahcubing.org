const supplementalData = window.supplementalData
const blacklist = window.blacklist
	
let params = new URLSearchParams(document.location.search)
let today = params.get("today")
if (!today) today = new Date().toLocaleDateString('en-CA', { timeZone: "America/Denver" })
let fourMonthsAgo = getDaysAgo(today, 90)

let base_url = 'https://raw.githubusercontent.com/robiningelbrecht'
let path = '/wca-rest-api/master/api/competitions/US.json'

fetch(base_url + path)
    .then(response => {
        if (!response.ok) throw new Error('Network response error')
        return response.json()
    })
    .then (competitions => {
        competitions = competitions.items
            .filter(competition => competition.date.from > fourMonthsAgo)
            .filter(competition => competition.organisers.some(organiser => organiser.name === 'Utah Cubing Association'))
			.filter(competition => !blacklist.includes(competition.id))
            .map(competition => {
            	// Strip out markdown hyperlinks
            	competition.venue.name = competition.venue.name.replace(/\[|\]|\(.*?\)/g, '')
            	competition = {...supplementalData[competition.id], ...competition}
            	return competition
            })
            .sort((competitionA, competitionB) => {
            	if (competitionA.date.from < competitionB.date.from) return -1
            	if (competitionA.date.from > competitionB.date.from) return 1
            	if (competitionA.name < competitionB.name) return -1
            	if (competitionA.name > competitionB.name) return 1
            	return 0
            })
            
        let pastCompetitions = competitions
        	.filter(competition => competition.date.till < today)
        	.sort((competitionA, competitionB) => {
            	if (competitionA.date.from > competitionB.date.from) return -1
            	if (competitionA.date.from < competitionB.date.from) return 1
            	if (competitionA.name < competitionB.name) return -1
            	if (competitionA.name > competitionB.name) return 1
            	return 0
            })

		let currentCompetitions = competitions
			.filter(competition => (competition.date.from <= today && competition.date.till >= today))

		let futureCompetitions = competitions
			.filter(competition => competition.date.from > today)
        
        console.log(pastCompetitions)
        console.log(currentCompetitions)
        console.log(futureCompetitions)
        
        if (currentCompetitions.length) populateTodayDiv(currentCompetitions)
  		if (futureCompetitions.length) populateTable(futureCompetitions, 'future-competitions', true)
  		if (pastCompetitions.length) populateTable(pastCompetitions, 'past-competitions', false)
    })
    
function populateTodayDiv(competitions) {
	let todayDiv = document.getElementById('today')

	competitions.forEach(competition => {
		let id = competition.id
		let liveId = competition.live_id
		let name = competition.name

		let h2 = document.createElement('h2')
		h2.textContent = `Today: ${name}`
		todayDiv.appendChild(h2)

		let list = document.createElement('ul')
		todayDiv.appendChild(list)
		if (liveId) {
			list.appendChild(stringToNode(`<li class="live"><a href="https://live.worldcubeassociation.org/competitions/${liveId}"><img src="/assets/svgs/font-awesome/stopwatch-solid-white.svg"> Live Results</a></li>`))
		}
		list.appendChild(stringToNode(`<li class="groups"><a href="https://www.competitiongroups.com/competitions/${id}"><img src="/assets/svgs/font-awesome/clipboard-solid-white.svg"> Group & Staffing Assignments</a></li>`))
		list.appendChild(stringToNode(`<li class="schedule"><a href="https://www.worldcubeassociation.org/competitions/${id}#competition-schedule"><img src="/assets/svgs/font-awesome/calendar-solid-white.svg"> Event Schedule</a></li>`))
		list.appendChild(stringToNode(`<li class="info"><a href="https://www.worldcubeassociation.org/competitions/${id}"><img src="/assets/svgs/font-awesome/circle-info-solid-white.svg"> General Information</a></li>`))
	})
}


function populateTable(competitions, tableId, includeRegistrationMessage) {
	let tableBody = document.getElementById(tableId)

	competitions.forEach(competition => {
		let date = formatDate(competition.date.from.trim())
		let id = competition.id.trim()
		let name = competition.name.trim()
		let link = `<a href="https://www.worldcubeassociation.org/competitions/${id}">${name}</a>`
		let venue = competition.venue.name.trim()
		let city = competition.city.trim()
	
		let row = tableBody.insertRow()
		let dateCell = row.insertCell()
		dateCell.className = 'date-column'
		let competitionCell = row.insertCell()
		competitionCell.className = 'competition-column'
		let venueCell = row.insertCell()
		venueCell.className = 'venue-column'
		
		dateCell.innerHTML = `${date}<br><span class="city">${city}</span>`
		competitionCell.innerHTML = `${link}`
		venueCell.innerHTML = `${venue}<br><span class="city">${city}</span>`

		if (competition.events.length) {
			let br = document.createElement('br')
			competitionCell.appendChild(br)
			competition.events
				.sort(canonicalEventSort)
				.forEach(event => {
					let icon = document.createElement('img')
					let url = `./assets/svgs/event/${event}.svg`
					icon.setAttribute('src', url)
					icon.setAttribute('class', 'event-icon')
					competitionCell.appendChild(icon)
				})
		}
			
		if (includeRegistrationMessage) {
			let br = document.createElement('br')
			competitionCell.appendChild(br)
			let registrationSpan = getRegistrationSpan(competition, today)
			if (registrationSpan) competitionCell.appendChild(registrationSpan)
		}
	})
}

function getRegistrationSpan(competition, today) {
	let registrationSpan = document.createElement('span')
	if (!competition.registration_opens || !competition.registration_closes) return null
	
	const openDate = formatDate(competition.registration_opens)
	const closeDate = formatDate(competition.registration_closes)

	if (!openDate || !closeDate) return null
	
	if (competition.registration_opens > today) {
		registrationSpan.textContent = `Registration opens ${openDate}`
		registrationSpan.className = 'registration-not-open'
	} else if (competition.registration_opens === today) {
		registrationSpan.textContent = 'Registration opens today'
		registrationSpan.className = 'registration-opens-today'
	} else if (competition.registration_closes > today) {
		registrationSpan.textContent = `Register now until ${closeDate}`
		registrationSpan.className = 'registration-open'
	} else if (competition.registration_closes === today) {
		registrationSpan.textContent = 'Registration closes today'
		registrationSpan.className = 'registration-closes-today'
	} else {
		registrationSpan.textContent = 'Registration closed'
		registrationSpan.className = 'registration-closed'
	}
	return registrationSpan
}

function getDaysAgo(dateString, daysAgo) {
    // Split the input date string into year, month, and day components
    var dateParts = dateString.split('-')
    var year = parseInt(dateParts[0], 10)
    var month = parseInt(dateParts[1], 10) - 1 // Months are 0-based in JavaScript
    var day = parseInt(dateParts[2], 10)

    // Create a new Date object with the specified year, month, and day
    var date = new Date(year, month, day)

    // Subtract days from the date
    date.setDate(date.getDate() - daysAgo)

    // Format the new date back into 'YYYY-MM-DD' format
    var formattedYear = date.getFullYear()
    var formattedMonth = (date.getMonth() + 1).toString().padStart(2, '0')
    var formattedDay = date.getDate().toString().padStart(2, '0')

    return `${formattedYear}-${formattedMonth}-${formattedDay}`
}

function formatDate(dateString) {
    try {
		// Split the input date string into year, month, and day components
		var dateParts = dateString.split('-')
		var year = parseInt(dateParts[0], 10)
		var month = parseInt(dateParts[1], 10) - 1 // Months are 0-based in JavaScript
		var day = parseInt(dateParts[2], 10)
		
		// Create a new Date object with the specified year, month, and day
		var date = new Date(year, month, day)
		
		// Array of month abbreviations
		var monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
						  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
		
		// Format the date components
		var formattedMonth = monthNames[date.getMonth()]
		var formattedDay = date.getDate()
		var formattedYear = date.getFullYear()
		
		// Combine the components into the desired format
		return `${formattedMonth} ${formattedDay}` // + `, ${formattedYear}`
	} catch (e) {
		return null
	}
}

function stringToNode(htmlString) {
  const template = document.createElement('template')
  template.innerHTML = htmlString.trim()
  return template.content.firstChild
}

const canonicalEventOrderMap = [
		'333',
		'222',
		'444',
		'555',
		'666',
		'777',
		'333bf',
		'333fm',
		'333oh',
		'clock',
		'minx',
		'pyram',
		'skewb',
		'sq1',
		'444bf',
		'555bf',
		'333mbf',
	]
	.reduce((acc, item, index) => {
	  acc[item] = index;
	  return acc;
	}, {});

function canonicalEventSort(eventA, eventB) {
	return canonicalEventOrderMap[eventA] - canonicalEventOrderMap[eventB];
}
