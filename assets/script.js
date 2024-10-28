let params = new URLSearchParams(document.location.search)
let today = params.get("today")
if (!today) today = new Date().toJSON().slice(0, 10)
let fourMonthsAgo = getDaysAgo(today, 120)

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
            .map(competition => {
            	// Strip out markdown hyperlinks
            	competition.venue.name = competition.venue.name.replace(/\[|\]|\(.*?\)/g, '')
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
        
  		populateTable(futureCompetitions, 'future-competitions')
  		populateTable(pastCompetitions, 'past-competitions')
    })
    
    
function populateTable(competitions, tableId) {
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
		
		dateCell.innerHTML = `${date}<br><span>${city}</span>`
		competitionCell.innerHTML = `${link}<br>`
		venueCell.innerHTML = `${venue}<br>${city}`

		competition.events
			.sort()
			.forEach(event => {
				let icon = document.createElement('img')
				let url = `./assets/svgs/event/${event}.svg`
				icon.setAttribute('src', url)
				icon.setAttribute('class', 'event-icon')
				competitionCell.appendChild(icon)
			})
	})
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
}
