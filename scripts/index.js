class RateLimitError extends Error {
	constructor(message) {
		super(message);
	}
}

const getJSON = async url => {
	const response = await fetch(url)
	if (response.status === 429) throw new RateLimitError(`Rate limit hit`)
	if (!response.ok) throw new Error(response.statusText)
	
	return response.json()
}

function lerp(a, b, t) {
	return a + (b - a) * t;
}

function interpolateOKLCH(c1, c2, t) {
	let h1 = c1.h, h2 = c2.h;
	
	let dh = h2 - h1;
	if (Math.abs(dh) > 180) {
		dh -= Math.sign(dh) * 360;
	}
	
	return {
		l: lerp(c1.l, c2.l, t),
		c: lerp(c1.c, c2.c, t),
		h: (h1 + dh * t + 360) % 360
	};
}

function getOKLCHStringForPercentage(percentage) {
	percentage = Math.min(Math.max(0, percentage), 100)
	let oklch = interpolateOKLCH({c: 0.237, h: 26.97, l: 0.6489}, {c: 0.2405, h: 151.41, l: 0.65}, percentage / 100)
	return `oklch(${oklch.l} ${oklch.c} ${oklch.h})`
}
function capitalizeFirstLetter(val) {
	return String(val).charAt(0).toUpperCase() + String(val).slice(1);
}

async function testComponent(component) {
	if (!component["fetchURI"].startsWith("!")) {
		try {
			const start = Date.now()
			const response = await fetch(component["fetchURI"], { signal: AbortSignal.timeout(2500) })
			if (!response.ok) return [false, `HTTP response not OK, got ${response.status} ${response.statusText}`]
			return [true, Date.now() - start]
		} catch (e) {
			return [false, e.message]
		}
	}
	return [false, "Protocol not supported."]
}

document.addEventListener("DOMContentLoaded", async () => {
	dayjs.extend(dayjs_plugin_advancedFormat)
	dayjs.extend(dayjs_plugin_relativeTime)
	dayjs.extend(dayjs_plugin_timezone)
	
	let body = $("body")
	
	let summaryText = $("<p></p>").addClass("info box").text("Please wait...")
	body.append(summaryText)
	
	let allOnline = true
	
	const config = await getJSON("/data/config.json")
	const outage = await getJSON("/data/current-outage.json")
	
	let maintenanceEvents
	
	try {
		maintenanceEvents = await getJSON(config["maintenanceAPI"])
	} catch (e) {
		maintenanceEvents = []
		body.append($("<p></p>").addClass("error box").text(`Unable to fetch maintenance events: ${e.message}`))
	}
	
	if (outage["inOutage"]) {
		let container = $("<div></div>").addClass("box warning")
		
		container.append($("<h3></h3>").css("margin", 0).css("text-decoration", "underline solid 1px rgba(255 255 255 / 50%)").text(outage["title"]))
		container.append($("<p></p>").css("margin", 0).html(`<b>Affects: ${outage["affects"]}</b><br/>${outage["events"].length} Update(s) available:`))
		
		for (update of outage["events"]) {
			let updateContainer = $("<div></div>").addClass("outage-update")
			
			updateContainer.append($("<p></p>").css("margin", 0).css("font-size", "1.25rem")
				.html(`<b>${update["title"]}</b> ${capitalizeFirstLetter(dayjs(update["timestamp"]).fromNow())}`))
			updateContainer.append($("<p></p>").text(update["description"]))
			
			container.append(updateContainer)
		}
		
		body.append(container)
	}
	
	for (site of config["sites"]) {
		let componentsOnline = 0
		let totalTime = 0
		
		body.append($("<div></div>").addClass("side-by-side")
			.append($("<h2></h2>").text(site["title"]))
			.append($("<h2></h2>").addClass("percentage-display").attr("id", `percentage-display-${site["id"]}`))
			.append($("<h2></h2>").addClass("percentage-display").attr("id", `rtime-display-${site["id"]}`)))
		
		for (component of site["components"]) {
			let online = false
			let error
			
			body.append($("<h3></h3>").text(component["title"]))
			
			const result = await testComponent(component)
			online = result[0]
			error = result[1]
			
			if (online) {
				componentsOnline++
				body.append($("<p></p>").css("color", "oklch(var(--success-base-lightness) var(--success-okch))")
					.append($("<b></b>").text("Online"))
					.append(` - ${error}ms`))
				totalTime += error
			} else {
				allOnline = false
				body.append($("<p></p>").css("color", "oklch(var(--error-base-lightness) var(--error-okch))")
					.append($("<b></b>").text("Offline"))
					.append(` - ${error}`))
			}
		}
		
		let percentage = Math.round((componentsOnline / site["components"].length) * 100)
		
		$(`#percentage-display-${site["id"]}`).text(`${percentage}%`).css("color", getOKLCHStringForPercentage(percentage))
		$(`#rtime-display-${site["id"]}`).text(`${Math.round(totalTime / componentsOnline)}ms avg.`).css("color", getOKLCHStringForPercentage(100 - ((totalTime / componentsOnline) / 750) * 100))
	}
	
	if (allOnline) {
		summaryText.removeClass("info warning error").addClass("success").text("All services operational!")
	} else {
		summaryText.removeClass("info error success").addClass("warning").text("Some services are experiencing degraded performance.")
	}
	
	if (maintenanceEvents.length > 0) body.append($("<h1></h1>").text("Maintenance Events"))
	
	maintenanceEvents.sort((a, b) => Date.parse(a["starts"]) - Date.parse(b["starts"]));
	
	for (maintenanceEvent of maintenanceEvents) {
		let starts = dayjs(maintenanceEvent["starts"])
		
		body.append($("<h2></h2>").text(maintenanceEvent["title"]))
		body.append($("<p></p>").html(`<span class="cl-accent"><b>${capitalizeFirstLetter(starts.fromNow())}</b></span>
										<span class="cl-darker-accent">${starts.format("HH:mm [on] D MMM YYYY")}</span><br/>
										<span class="cl-accent">Affects: ${maintenanceEvent["affects"]}</span>`).css("margin-bottom", 5))
		body.append($("<p></p>").text(`${maintenanceEvent["description"]}`))
	}
})
