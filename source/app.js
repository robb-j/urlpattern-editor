/** @satisfies {Record<string, HTMLInputElement>} */
const inputs = {
	input: document.querySelector("#input"),
	protocol: document.querySelector("#protocol"),
	username: document.querySelector("#username"),
	password: document.querySelector("#password"),
	hostname: document.querySelector("#hostname"),
	port: document.querySelector("#port"),
	pathname: document.querySelector("#pathname"),
	search: document.querySelector("#search"),
	hash: document.querySelector("#hash"),

	value: document.querySelector("#value"),
};

/** @satisfies {Record<string, HTMLElement>} */
const elements = {
	result: document.querySelector("#result"),
	output: document.querySelector("#output"),
	debug: document.querySelector("#debug"),
};

const patternFields = [
	"protocol",
	"username",
	"password",
	"hostname",
	"port",
	"pathname",
	"search",
	"hash",
];

function debug(value) {
	console.debug(value);
	elements.debug.textContent += value + "\n";
}

class DetailsHelper extends HTMLElement {
	static observedAttributes = ["persist"];

	get persist() {
		return this.getAttribute("persist");
	}
	set persist(newValue) {
		if (newValue) this.setAttribute("persist", newValue);
		else this.removeAttribute("persist");
	}

	get _persistenceKey() {
		return "details-helper:" + this.persist;
	}

	isOpen() {
		return Boolean(this.persist && localStorage.getItem(this._persistenceKey));
	}

	/** @param {boolean} value */
	_updatePersistence(value) {
		if (value) localStorage.setItem(this._persistenceKey, "true");
		else localStorage.removeItem(this._persistenceKey);
	}

	/** @type {HTMLDetailsElement} */
	get detailsElem() {
		return this.querySelector("details");
	}

	connectedCallback() {
		const elem = this.detailsElem;
		if (elem) {
			elem.open = this.isOpen();
			elem.addEventListener("toggle", () => {
				this._updatePersistence(elem.open);
			});
		}
	}
	attributeChangedCallback() {
		const elem = this.detailsElem;
		if (elem) elem.open = this.isOpen();
	}
}

/** @param {HTMLElement} elem */
function setError(elem, error = "") {
	const parent = elem?.closest(".field");
	const span = parent?.querySelector(".field-error");
	if (span) span.textContent = error;
}

/**
 * Update pattern from a change in the "input" field
 * @param {string} input
 */
function updateInput(source) {
	try {
		const pattern = new URLPattern(inputs.input.value);

		for (const key of patternFields) {
			inputs[key].value = pattern[key] || "*";
		}
		setError(source);
	} catch (error) {
		debug(error);
		setError(source, "Invalid value");
	}
}

// For some reason "port" isn't defaulting to '*' (in Firefox?)
function hasCompValue(input) {
	return input && input !== "*";
}

/**
 * Attempt to recreate the "input" of a URLPattern instance
 * @param {URLPattern} pattern
 */
function reconstructInput(pattern) {
	const components = [pattern.protocol + "://"];

	// Add the user:pass@ section if one of those was specified
	if (hasCompValue(pattern.username) || hasCompValue(pattern.password)) {
		components.push(pattern.username, ":", pattern.password, "@");
	}

	components.push(pattern.hostname);

	// Add the port if it was specified
	if (hasCompValue(pattern.port)) {
		components.push(":" + pattern.port);
	}

	components.push(pattern.pathname);

	// Add the search or hash if they was set
	if (hasCompValue(pattern.search)) components.push("?", pattern.search);
	if (hasCompValue(pattern.hash)) components.push("#", pattern.hash);

	return components.join("");
}

/**
 * Update the pattern from a change in one of the component fields
 * @param {HTMLInputElement} elem
 */
function updateComponent(elem, key) {
	try {
		// Aggregate each input's value into a URLPatternInit object
		const init = {};
		for (const key of patternFields) init[key] = inputs[key].value;

		// Create the pattern and update the "input" field
		const pattern = new URLPattern(init);
		inputs.input.value = reconstructInput(pattern);

		setError(elem);
	} catch (error) {
		debug(error);
		setError(elem, "Invalid value");
	}
}

/** Try to construct a URLPattern but return null rather than throwing an error */
function tryPattern(input, baseURL) {
	try {
		return new URLPattern(input, baseURL);
	} catch (error) {
		debug(error);
		return null;
	}
}

/**
 * Update the test output based on a change in the test input or pattern
 * @param {HTMLInputElement} source
 */
function updateTestValue(source) {
	try {
		const pattern = tryPattern(inputs.input.value);
		if (!pattern) return;

		const result = pattern.exec(inputs.value.value);
		elements.output.innerHTML = JSON.stringify(result, null, 2);

		if (!result) {
			elements.result.innerHTML = "<p>No match found</p>";
		} else {
			let str =
				"<table><thead><tr><th>Component</th><th>Name</th><th>Value</th></tr></thead>";

			// Generate a HTML table with the results
			for (const key of patternFields) {
				if (Object.values(result[key].groups).some((v) => Boolean(v))) {
					for (const [group, value] of Object.entries(result[key].groups)) {
						str += `<tr>`;
						str += `  <td><strong>${key}</strong></td>`;
						str += `  <td>${group}</td>`;
						str += `  <td><code>${value}</code></td>`;
						str += `</tr>`;
					}
				}
			}

			elements.result.innerHTML = str;
		}
	} catch (error) {
		debug(error);
		setError(source, "Invalid value");
	}
}

async function register() {
	try {
		await navigator.serviceWorker.register("service-worker.js", { scope: "/" });
	} catch (error) {
		console.error("[service worker]", error);
	}
}

async function main() {
	debug("start");

	if ("serviceWorker" in navigator) register();

	customElements?.define("details-helper", DetailsHelper);

	// Set up fields from URL search parameters
	const { searchParams } = new URL(location.href);
	if (searchParams.has("input")) inputs.input.value = searchParams.get("input");
	if (searchParams.has("value")) inputs.value.value = searchParams.get("value");

	// Initially setup fields from the input & test value
	updateInput(inputs.input);
	updateTestValue(inputs.value);

	// Listen for input changes to update the component fields & test results
	inputs.input.oninput = () => {
		updateInput(inputs.input);
		updateTestValue();
	};

	// Listen for component changes to update the input field & test results
	for (const key of patternFields) {
		inputs[key].oninput = () => {
			updateComponent(inputs[key], key);
			updateTestValue();
		};
	}

	// Listen for test value changes and update the results
	inputs.value.oninput = () => {
		updateTestValue(inputs.value);
	};
}

main();
