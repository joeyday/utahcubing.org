let today = new Date().toJSON().slice(0, 10)
let params = new URLSearchParams(document.location.search)
let date = params.get("date")
if (date) today = date


let base_url = 'https://raw.githubusercontent.com/robiningelbrecht'
let path = '/wca-rest-api/master/api/competitions/US.json'
fetch(base_url + path)
    .then(response => {
        if (!response.ok) throw new Error('Network response error')
        return response.json()
    })
    .then (competitions => {
        competitions = competitions.items
            .filter(competition => competition.date.from > today)
            .filter(competition => {
                if (competition.city.slice(-4) === 'Utah') return true
                if (competition.city.slice(-5) === 'Idaho') return true
                return false
            })
            .sort((competitionA, competitionB) => {
            	if (competitionA.date.from < competitionB.date.from) return -1
            	if (competitionA.date.from > competitionB.date.from) return 1
            	if (competitionA.name < competitionB.name) return -1
            	if (competitionA.name > competitionB.name) return 1
            	return 0
            })
        
        console.log(competitions)
        
        let tableBody = document.getElementById('competitions')
  
        competitions.forEach(competition => {
            let row = tableBody.insertRow()
            
            let nameCell = row.insertCell()
            let locationCell = row.insertCell()
            let cityCell = row.insertCell()
            let eventCell = row.insertCell()
            let dateCell = row.insertCell()
            
            nameCell.textContent = competition.name.trim()
            locationCell.textContent = competition.venue.name.trim()
            cityCell.textContent = competition.city.trim()
            dateCell.textContent = competition.date.from.trim()
            
        })
    })

