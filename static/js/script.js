document.addEventListener("DOMContentLoaded", () => {
  const currentPath = window.location.pathname
  const isSettingsPage = currentPath.includes("/settings")
  const isDashboardPage =  !isSettingsPage
  console.log("Current page:", isDashboardPage ? "Dashboard" : "Settings")

  // Only initialize charts if we're on the dashboard page
  if (!isDashboardPage) {
    console.log("Not on dashboard page, skipping chart initialization")
    return // Exit early if not on dashboard page
  }

  const mainSplitRange = {
    currentServerInterval: 1 / 60,
  }
  const intervaltime = {
    delay: 1000 * 60 * mainSplitRange.currentServerInterval,
  }
  

/**
 * Menghitung Simple Moving Average (SMA) dari sebuah array data.
 * @param {number[]} data - Array data numerik.
 * @param {number} windowSize - Ukuran jendela untuk rata-rata.
 * @returns {Array} Array berisi nilai SMA.
 */
function simpleMovingAverage(data, windowSize) {
  if (!data || data.length < windowSize) return [];
  const sma = [];
  // Untuk membuat garis tren lebih responsif, kita mulai dari awal
  for (let i = 0; i < data.length; i++) {
    if (i < windowSize - 1) {
      // Untuk data awal, kita rata-ratakan apa yang ada
      const windowSlice = data.slice(0, i + 1);
      const avg = windowSlice.reduce((sum, val) => sum + val, 0) / windowSlice.length;
      sma.push(avg);
    } else {
      // Setelah jendela penuh, gunakan rata-rata bergerak standar
      const windowSlice = data.slice(i - windowSize + 1, i + 1);
      const avg = windowSlice.reduce((sum, val) => sum + val, 0) / windowSize;
      sma.push(avg);
    }
  }
  return sma;
}

  // Time range configurations (in seconds)
  const timeRanges = {
    "1h": 3600, // 1 hour = 3600 seconds
    "6h": 21600, // 6 hours = 21600 seconds
    "24h": 86400, // 24 hours = 86400 seconds
    "7d": 604800, // 7 days = 604800 seconds
    "30d": 2592000, // 30 days = 2592000 seconds
  }

  // Easily adjust these values to change the warning thresholds
  const warningThresholds = {
    // Powermeter thresholds
    pm_voltage: 200, // Voltage warning threshold
    pm_current: 100, // Current warning threshold
    pm_r: 500, // R parameter warning threshold
    pm_q: 500, // Q parameter warning threshold
    pm_s: 500, // S parameter warning threshold

    // Engine thresholds
    e_speed: 2000, // Engine speed warning threshold
    e_load: 100, // Engine load warning threshold (percentage)
    e_fuelrate: 100, // Fuel rate warning threshold
    e_runhour: 5000, // Engine run hour warning threshold
    e_oilpressure: 100, // Oil pressure warning threshold

    // Basic sensor thresholds
    ch1: 1000, // Discharge Pressure warning threshold
    ch2: 1000, // Suction Pressure warning threshold
    ch3: 1000, // Vibration warning threshold
    ch4: 1000,
    ch5: 1000,
    ch6: 1000,
    ch7: 200,
  }
  updateSensorTitles()
  // Add this HTML for the warning popup to the body
  document.body.insertAdjacentHTML(
    "beforeend",
    `
    <div id="warning-overlay" class="fixed inset-0 bg-black bg-opacity-50 z-50 hidden flex items-center justify-center">
      <div id="warning-popup" class="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 overflow-hidden">
        <div class="bg-red-600 px-4 py-3 flex items-center justify-between">
          <h3 class="text-white font-bold text-lg flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            WARNING ALERT
          </h3>
          <button id="close-warning" class="text-white hover:text-gray-200 focus:outline-none">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div class="p-6">
          <div class="flex items-start mb-4">
            <div class="flex-shrink-0 bg-red-100 rounded-full p-2">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div class="ml-4">
              <h4 class="text-lg font-semibold text-gray-900">Critical Value Detected</h4>
              <p class="text-gray-600" id="warning-message">A sensor value has exceeded the safe threshold.</p>
            </div>
          </div>
          <div id="warning-details" class="bg-red-50 p-4 rounded-md border border-red-200 mb-4">
            <div class="flex items-center">
              <span class="font-medium text-red-800">Current value:</span>
              <span id="warning-value" class="ml-2 font-bold text-red-800">0</span>
            </div>
            <div class="flex items-center mt-1">
              <span class="font-medium text-red-800">Threshold:</span>
              <span id="warning-threshold" class="ml-2 font-bold text-red-800">0</span>
            </div>
          </div>
          <div class="text-sm text-gray-500">
            <p>Please take immediate action to address this issue.</p>
            <p class="mt-1">Contact maintenance if the problem persists.</p>
          </div>
        </div>
        <div class="bg-gray-50 px-4 py-3 flex justify-end">
          <button id="acknowledge-warning" class="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2">
            Acknowledge
          </button>
        </div>
      </div>
    </div>
  `,
  )

  let isrecording = false

  function updateStatusIndicator(recording) {
    isrecording = recording
    if (recording) {
      statusIndicator.className =
        "inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800"
      statusIndicator.innerHTML = '<span class="h-2 w-2 mr-1 rounded-full bg-green-500"></span> Recording'
    } else {
      statusIndicator.className =
        "inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800"
      statusIndicator.innerHTML = '<span class="h-2 w-2 mr-1 rounded-full bg-red-500"></span> Unrecording'
    }
  }

  console.log("DOM loaded - initializing application")

  // Check system state on page load
  async function checkSystemState() {
    fetch("/api/system-state")
      .then((response) => response.json())
      .then(async (data) => {
        if (data.running) {
          console.log("System is running")
          updateStatusIndicator(true)

          // Sync with server interval first
          await getCurrentInterval()

          // Set button states
          startButton.disabled = true
          stopButton.disabled = false

          // Start intervals with correct server timing
          if (!intervalId) {
            intervalId = setInterval(fetchData, currentServerInterval)
          }

          if (!enginePowermeterChartIntervalId) {
            updateEngineCharts()
            updatePowermeterCharts()
            updateCombinedChart()
            updateCharts()
            enginePowermeterChartIntervalId = setInterval(() => {
              updateEngineCharts()
              updatePowermeterCharts()
            }, currentServerInterval)
          }

          if (!displayUpdateIntervalId) {
            loadPowermeterDisplay()
            loadEngineDisplay()
            displayUpdateIntervalId = setInterval(() => {
              loadPowermeterDisplay()
              loadEngineDisplay()
            }, currentServerInterval)
          }

          isRealtime = true
        } else {
          console.log("System is stopped")
          updateStatusIndicator(false)

          startButton.disabled = false
          stopButton.disabled = true

          // Clear intervals when system is stopped
          clearInterval(intervalId)
          clearInterval(enginePowermeterChartIntervalId)
          clearInterval(displayUpdateIntervalId)
          intervalId = null
          enginePowermeterChartIntervalId = null
          displayUpdateIntervalId = null

          isRealtime = false
        }
      })
      .catch((error) => {
        console.error("Error checking system state:", error)
        startButton.disabled = false
        stopButton.disabled = false
      })
  }

  // Call this function on page load
  checkSystemState()

  // After checkSystemState(), add:
  getCurrentInterval().then(() => {
    console.log("Initial interval loaded from server")
  })

  // Remove the hardcoded intervaltime configuration and replace with:
  let currentServerInterval = 1000

  // Function to get current interval from server
  async function getCurrentInterval() {
    try {
      const response = await fetch("/get-interval")
      const data = await response.json()
      currentServerInterval = data.secTimeInterval * 1000 // Convert to milliseconds
      console.log(`Current server interval: ${currentServerInterval}ms`)
      return currentServerInterval
    } catch (error) {
      console.error("Error fetching interval:", error)
      return 5000 // Default fallback
    }
  }

  // Add this function after the getCurrentInterval function:
  // Listen for interval changes from settings page
  window.addEventListener("intervalChanged", async (event) => {
    currentServerInterval = event.detail.interval
    console.log(`Interval changed to: ${currentServerInterval}ms`)
    updateAllIntervals()
  })

  // Listen for storage changes (for cross-tab communication)
  window.addEventListener("storage", (event) => {
    if (event.key === "serverInterval") {
      const newInterval = Number.parseInt(event.newValue)
      if (!isNaN(newInterval) && newInterval > 0) {
        currentServerInterval = newInterval
        console.log(`Interval updated from storage: ${currentServerInterval}ms`)
        updateAllIntervals()
      }
    }
  })

  function updateAllIntervals() {
    console.log(`Updating all intervals to ${currentServerInterval}ms`)

    // Update basic sensor chart intervals (for index.html)
    if (intervalId) {
      clearInterval(intervalId)
      intervalId = setInterval(fetchData, currentServerInterval) // Use server interval instead of refreshRate
    }

    // Update engine and powermeter chart intervals
    if (enginePowermeterChartIntervalId) {
      clearInterval(enginePowermeterChartIntervalId)
      enginePowermeterChartIntervalId = setInterval(() => {
        updateEngineCharts()
        updatePowermeterCharts()
      }, currentServerInterval)
    }

    // Update display intervals
    if (displayUpdateIntervalId) {
      clearInterval(displayUpdateIntervalId)
      displayUpdateIntervalId = setInterval(() => {
        loadPowermeterDisplay()
        loadEngineDisplay()
      }, currentServerInterval)
    }

    // Update stacked charts with current time range to reflect new interval
    updateCombinedChart(currentTimeRange)
  }

  // Make functions globally accessible
  window.getCurrentInterval = getCurrentInterval
  window.updateAllIntervals = updateAllIntervals
  window.currentServerInterval = currentServerInterval

  // ===== CONFIGURATION =====
  // Tailwind configuration
  window.tailwind = {
    config: {
      theme: {
        fontFamily: {
          sans: ["Inter", "sans-serif"],
        },
        extend: {
          colors: {
            primary: {
              50: "#f0f9ff",
              100: "#e0f2fe",
              200: "#bae6fd",
              300: "#7dd3fc",
              400: "#38bdf8",
              500: "#0ea5e9",
              600: "#0284c7",
              700: "#0369a1",
              800: "#075985",
              900: "#0c4a6e",
            },
          },
          boxShadow: {
            card: "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)",
          },
        },
      },
    },
  }

  // Global variable to store sensor calibrations
  let sensorCalibrations = {} 
  let modalChart = null;

  // Function to load sensor calibrations
  async function loadSensorCalibrations() {
    try {
      const response = await fetch("/api/all-sensor-calibrations")
      const data = await response.json()
      sensorCalibrations = data
      console.log("Sensor calibrations loaded:", sensorCalibrations)
      return sensorCalibrations
    } catch (error) {
      console.error("Error loading sensor calibrations:", error)
      return {}
    }
  }

  // Function to format sensor value with unit
  function formatSensorValue(value, channel) {
    const calibration = sensorCalibrations[channel]
    if (calibration && calibration.unit) {
      return `${value.toFixed(4)} ${calibration.unit}`
    }
    return value.toFixed(4)
  }

  // Function to get sensor display name with unit
  function getSensorDisplayName(channel) {
    const calibration = sensorCalibrations[channel]
    if (calibration) {
      const name = calibration.name || `CH${channel.slice(-1)}`
      const unit = calibration.unit ? ` (${calibration.unit})` : ""
      return name + unit
    }
    return channel.toUpperCase()
  }

  let stackedch1Chart,
    stackedch2Chart,
    stackedch3Chart,
    stackedch4Chart,
    stackedch5Chart,
    stackedch6Chart,
    stackedch7Chart

  // Remove these variables as we'll use allData directly:
  // let realtimeDataBuffers = { ... }
  // let lastUpdateTime = Date.now()

  let selectedSensors = {
    ch1: "Discharge Pressure",
    ch2: "Suction Pressure",
    ch3: "Vibration",
    ch4: "Sensor 4",
    ch5: "Sensor 5",
    ch6: "Sensor 6",
    ch7: "Sensor 7",
  }

  // Load saved sensor selections
  const saved = localStorage.getItem("selectedSensors")
  if (saved) {
    selectedSensors = JSON.parse(saved)
    console.log("Loaded from localStorage:", selectedSensors)
  } else {
    // If no saved selections, save the defaults
    localStorage.setItem("selectedSensors", JSON.stringify(selectedSensors))
  }

  // Update UI with saved sensor selections
  async function updateSensorTitles() {
    try {
      // Load calibrations first
      await loadSensorCalibrations()

      const response = await fetch("/load-sensors")
      const config = await response.json()

      for (let i = 1; i <= 7; i++) {
        const sensor = config[`sensor${i}`]
        const channel = `ch${i}`

        // Judul utama (card biasa)
        const titleEl = document.getElementById(`${channel}-title`)
        const card = titleEl?.closest(".dashboard-card")

        // Judul stacked chart
        const stackedTitle = document.getElementById(`stacked-${channel}-title`)
        const stackedCard = stackedTitle?.closest(".chart-wrapper")

        // Table header
        const tableHeader = document.getElementById(`table-${channel}-header`)

        // Set title with unit if available
        const calibration = sensorCalibrations[channel]
        let displayName = sensor?.name?.trim() || `Sensor ${i}`
        if (calibration && calibration.unit) {
          displayName += ` (${calibration.unit})`
        }

        if (titleEl) titleEl.textContent = displayName
        if (stackedTitle) stackedTitle.textContent = displayName
        if (tableHeader) tableHeader.textContent = displayName

        // Hide if sensor disabled
        if (sensor && !sensor.enabled) {
          if (card) card.style.display = "none"
          if (stackedCard) stackedCard.style.display = "none"
        } else {
          if (card) card.style.display = ""
          if (stackedCard) stackedCard.style.display = ""
        }
      }
    } catch (err) {
      console.error("Failed to update sensor titles:", err)
    }
  }

  window.switchSensor = (channel, sensorName) => {
    selectedSensors[channel] = sensorName
    document.getElementById(`${channel}-title`).innerText = sensorName
    const tableHeader = document.getElementById(`table-${channel}-header`)
    if (tableHeader) tableHeader.innerText = sensorName

    localStorage.setItem("selectedSensors", JSON.stringify(selectedSensors))

    fetch("/save-sensors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(selectedSensors),
    })

    // Update chart label langsung tanpa refresh
    if (combinedChart) {
      if (channel === "ch1") combinedChart.data.datasets[0].label = sensorName
      if (channel === "ch2") combinedChart.data.datasets[1].label = sensorName
      if (channel === "ch3") combinedChart.data.datasets[2].label = sensorName
      if (channel === "ch4") combinedChart.data.datasets[3].label = sensorName
      if (channel === "ch5") combinedChart.data.datasets[4].label = sensorName
      if (channel === "ch6") combinedChart.data.datasets[5].label = sensorName
      if (channel === "ch7") combinedChart.data.datasets[6].label = sensorName
      combinedChart.update()
    }

    // Optional: refresh data points if needed
    if (typeof updateCombinedChart === "function") {
      updateCombinedChart(range  || "custom")
    }
  }

  // ===== SIDEBAR FUNCTIONALITY =====
  function initSidebar() {
    const sidebar = document.getElementById("sidebar")
    const sidebarToggle = document.getElementById("sidebar-toggle")
    const sidebarClose = document.getElementById("sidebar-close")
    const sidebarOverlay = document.getElementById("sidebar-overlay")

    if (!sidebar || !sidebarToggle || !sidebarOverlay) return

    function openSidebar() {
      sidebar.classList.remove("-translate-x-full")
      sidebarOverlay.classList.remove("hidden")
      sidebarToggle.classList.add("move-right")
    }

    function closeSidebar() {
      sidebar.classList.add("-translate-x-full")
      sidebarOverlay.classList.add("hidden")
      sidebarToggle.classList.remove("move-right")
    }

    sidebarToggle.addEventListener("click", () => {
      if (sidebar.classList.contains("-translate-x-full")) {
        openSidebar()
      } else {
        closeSidebar()
      }
    })

    if (sidebarClose) {
      sidebarClose.addEventListener("click", closeSidebar)
    }

    sidebarOverlay.addEventListener("click", closeSidebar)

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !sidebar.classList.contains("-translate-x-full")) {
        closeSidebar()
      }
    })

    function handleResponsiveLayout() {
      if (window.innerWidth < 768) {
        closeSidebar()
      }
    }

    window.addEventListener("resize", handleResponsiveLayout)
    handleResponsiveLayout()
  }

  // ===== TAB SWITCHING FUNCTIONALITY =====
  function initTabs() {
    const tabButtons = document.querySelectorAll(".tab-button")
    const tabPanels = document.querySelectorAll(".tab-panel")

    if (tabButtons.length === 0 || tabPanels.length === 0) return

    tabButtons.forEach((button) => {
      button.addEventListener("click", () => {
        // Deactivate all tabs
        tabButtons.forEach((btn) => {
          btn.classList.remove("active", "bg-blue-600", "text-white")
          btn.classList.add("bg-gray-100", "text-gray-700")
          btn.setAttribute("aria-selected", "false")
        })

        // Hide all panels
        tabPanels.forEach((panel) => {
          panel.classList.add("hidden")
        })

        // Activate clicked tab
        button.classList.remove("bg-gray-100", "text-gray-700")
        button.classList.add("active", "bg-blue-600", "text-white")
        button.setAttribute("aria-selected", "true")

        // Show corresponding panel
        const panelId = button.getAttribute("aria-controls")
        document.getElementById(panelId).classList.remove("hidden")
      })
    })
  }

  // ===== FORM SUBMISSION HANDLING =====
  function initForms() {
    const engineForm = document.getElementById("form-engine")
    const powermeterForm = document.getElementById("form-powermeter")
    const sensorsForm = document.getElementById("form-sensors")

    if (!engineForm && !powermeterForm && !sensorsForm) return

    function showToast(title, message) {
      const toastContainer = document.getElementById("toast-container")
      if (!toastContainer) return

      const toast = document.createElement("div")
      toast.className = "toast bg-white border border-gray-200 rounded-lg shadow-lg p-4 mb-3 max-w-md flex items-start"
      toast.innerHTML = `
        <div class="flex-shrink-0 text-green-500 mr-3">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-check-circle">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
        </div>
        <div>
          <h4 class="font-medium text-gray-900">${title}</h4>
          <p class="text-sm text-gray-600">${message}</p>
        </div>
        <button class="ml-auto text-gray-400 hover:text-gray-500" onclick="this.parentElement.remove()">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-x">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      `

      toastContainer.appendChild(toast)

      // Auto remove after 3 seconds
      setTimeout(() => {
        if (toast.parentElement) {
          toast.remove()
        }
      }, 3000)
    }

    function handleFormSubmit(formId, url, successMessage) {
      const form = document.getElementById(formId)
      if (!form) return

      form.addEventListener("submit", function (e) {
        e.preventDefault()

        const options = {
          method: "POST",
        }

        if (formId === "form-sensors") {
          options.body = (() => {
            const data = {}
            const formDataObj = new FormData(this)
            for (let i = 1; i <= 7; i++) {
              const enabled = formDataObj.get(`sensor${i}_enabled`) === "on"
              const name = formDataObj.get(`sensor${i}_name`)
              const min = formDataObj.get(`sensor${i}_min`) || "0"
              const max = formDataObj.get(`sensor${i}_max`) || "100"
              const unit = formDataObj.get(`sensor${i}_unit`) || ""

              data[`sensor${i}`] = {
                name: name,
                enabled: enabled,
                min: Number.parseFloat(min),
                max: Number.parseFloat(max),
                unit: unit,
              }
            }
            return JSON.stringify(data)
          })()
          options.headers = { "Content-Type": "application/json" }
        } else {
          options.body = new FormData(this)
        }

        fetch(url, options)
          .then((res) => res.json())
          .then((res) => {
            console.log(res)
            showToast(successMessage.title, successMessage.message)
          })
          .catch((err) => {
            console.error(`Failed to save settings for ${formId}:`, err)
          })
      })
    }

    handleFormSubmit("form-engine", "/save-engine", {
      title: "Engine settings saved",
      message: "Your engine channel settings have been updated.",
    })

    handleFormSubmit("form-powermeter", "/save-powermeter", {
      title: "Powermeter settings saved",
      message: "Your powermeter channel settings have been updated.",
    })

    handleFormSubmit("form-sensors", "/save-sensors-config", {
      title: "Sensor settings saved",
      message: "Your sensor settings have been updated.",
    })
  }

  // ===== POWERMETER DISPLAY FUNCTIONALITY =====
  // Update the loadPowermeterDisplay function to improve table layout
  async function loadPowermeterDisplay() {
    const powermeterDisplay = document.getElementById("powermeter-display")
    if (!powermeterDisplay) return

    try {
      const [modbusResponse, settingsResponse] = await Promise.all([
        fetch("/api/powermeter-data"),
        fetch("/load-powermeter"),
      ])

      const modbus = await modbusResponse.json()
      const data = await settingsResponse.json()
      const pmValues = modbus || []

      if (data && Object.keys(data).length > 0) {
        powermeterDisplay.innerHTML = `
        <h2 class="text-lg font-semibold text-gray-700 mb-2 text-center">Powermeter Settings</h2>
            <p class="text-sm text-gray-500 mb-4 text-center">IP Powermeter: ${data.pm_ip ?? "-"} </p>
            <div class="overflow-x-auto">
              <table class="w-full text-center border border-gray-300">
                <thead class="bg-gray-100 text-gray-700">
                  <tr>
                    <th class="border px-2 py-2 whitespace-nowrap">No</th>
                    <th class="border px-2 py-2 whitespace-nowrap">Name</th>
                    <th class="border px-2 py-2 whitespace-nowrap">Address</th>
                    <th class="border px-2 py-2 whitespace-nowrap">Value</th>
                  </tr>
                </thead>
                <tbody class="text-gray-600">
                  <tr><td class="border px-2 py-2">1</td><td class="border px-2 py-2">Current</td><td class="border px-2 py-2">${data.pm_current ?? "-"}</td><td class="border px-2 py-2">${pmValues.find((v) => v.register === Number.parseInt(data.pm_current))?.value ?? "-"}</td></tr>
                  <tr><td class="border px-2 py-2">2</td><td class="border px-2 py-2">Voltage</td><td class="border px-2 py-2">${data.pm_voltage ?? "-"}</td><td class="border px-2 py-2">${pmValues.find((v) => v.register === Number.parseInt(data.pm_voltage))?.value ?? "-"}</td></tr>
                  <tr><td class="border px-2 py-2">3</td><td class="border px-2 py-2">R</td><td class="border px-2 py-2">${data.pm_r ?? "-"}</td><td class="border px-2 py-2">${pmValues.find((v) => v.register === Number.parseInt(data.pm_r))?.value ?? "-"}</td></tr>
                  <tr><td class="border px-2 py-2">4</td><td class="border px-2 py-2">Q</td><td class="border px-2 py-2">${data.pm_q ?? "-"}</td><td class="border px-2 py-2">${pmValues.find((v) => v.register === Number.parseInt(data.pm_q))?.value ?? "-"}</td></tr>
                  <tr><td class="border px-2 py-2">5</td><td class="border px-2 py-2">S</td><td class="border px-2 py-2">${data.pm_s ?? "-"}</td><td class="border px-2 py-2">${pmValues.find((v) => v.register === Number.parseInt(data.pm_s))?.value ?? "-"}</td></tr>
                </tbody>
              </table>
            </div>
        `
      } else {
        powermeterDisplay.innerHTML = `<p class="text-gray-500 text-center">No powermeter data saved yet.</p>`
      }
    } catch (err) {
      console.error("Error loading powermeter:", err)
    }
  }

  // ===== ENGINE DISPLAY FUNCTIONALITY =====
  // Update the loadEngineDisplay function to improve table layout

  async function loadEngineDisplay() {
    const engineDisplay = document.getElementById("engine-display")
    if (!engineDisplay) return

    try {
      const [modbusResponse, settingsResponse] = await Promise.all([fetch("/api/engine-data"), fetch("/load-engine")])

      const modbus = await modbusResponse.json()
      const data = await settingsResponse.json()
      const engineValues = modbus || []

      if (data && Object.keys(data).length > 0) {
        engineDisplay.innerHTML = `
        <h2 class="text-lg font-semibold text-gray-700 mb-2 text-center">Engine Settings</h2>
            <p class="text-sm text-gray-500 mb-4 text-center">IP Engine: ${data.e_ip ?? "-"} </p>
            <div class="overflow-x-auto">
              <table class="w-full text-center border border-gray-300">
                <thead class="bg-gray-100 text-gray-700">
                  <tr>
                    <th class="border px-2 py-2 whitespace-nowrap">No</th>
                    <th class="border px-2 py-2 whitespace-nowrap">Name</th>
                    <th class="border px-2 py-2 whitespace-nowrap">Address</th>
                    <th class="border px-2 py-2 whitespace-nowrap">Value</th>
                  </tr>
                </thead>
                <tbody class="text-gray-600">
                  <tr><td class="border px-2 py-2">1</td><td class="border px-2 py-2">Speed</td><td class="border px-2 py-2">${data.e_speed ?? "-"}</td><td class="border px-2 py-2">${engineValues.find((v) => v.register === Number.parseInt(data.e_speed))?.value ?? "-"}</td></tr>
                  <tr><td class="border px-2 py-2">2</td><td class="border px-2 py-2">Load</td><td class="border px-2 py-2">${data.e_load ?? "-"}</td><td class="border px-2 py-2">${engineValues.find((v) => v.register === Number.parseInt(data.e_load))?.value ?? "-"}</td></tr>
                  <tr><td class="border px-2 py-2">3</td><td class="border px-2 py-2">Fuelrate</td><td class="border px-2 py-2">${data.e_fuelrate ?? "-"}</td><td class="border px-2 py-2">${engineValues.find((v) => v.register === Number.parseInt(data.e_fuelrate))?.value ?? "-"}</td></tr>
                  <tr><td class="border px-2 py-2">4</td><td class="border px-2 py-2">Runhour</td><td class="border px-2 py-2">${data.e_runhour ?? "-"}</td><td class="border px-2 py-2">${engineValues.find((v) => v.register === Number.parseInt(data.e_runhour))?.value ?? "-"}</td></tr>
                  <tr><td class="border px-2 py-2">5</td><td class="border px-2 py-2">Oil Pressure</td><td class="border px-2 py-2">${data.e_oilpressure ?? "-"}</td><td class="border px-2 py-2">${engineValues.find((v) => v.register === Number.parseInt(data.e_oilpressure))?.value ?? "-"}</td></tr>
                </tbody>
              </table>
            </div>
        `
      } else {
        engineDisplay.innerHTML = `<p class="text-gray-500 text-center">No engine data saved yet.</p>`
      }
    } catch (err) {
      console.error("Error loading engine:", err)
    }
  }

  // ===== DASHBOARD FUNCTIONALITY =====
  // DOM Elements
  const startButton = document.getElementById("start")
  const stopButton = document.getElementById("stop")
  const statusIndicator = document.getElementById("status-indicator")
  const dataTable = document.getElementById("data-table")

  // Channel value displays
  const ch1Value = document.getElementById("ch1-value")
  const ch2Value = document.getElementById("ch2-value")
  const ch3Value = document.getElementById("ch3-value")
  const ch4Value = document.getElementById("ch4-value")
  const ch5Value = document.getElementById("ch5-value")
  const ch6Value = document.getElementById("ch6-value")
  const ch7Value = document.getElementById("ch7-value")
  const ch1Updated = document.getElementById("ch1-updated")
  const ch2Updated = document.getElementById("ch2-updated")
  const ch3Updated = document.getElementById("ch3-updated")
  const ch4Updated = document.getElementById("ch4-updated")
  const ch5Updated = document.getElementById("ch5-updated")
  const ch6Updated = document.getElementById("ch6-updated")
  const ch7Updated = document.getElementById("ch7-updated")

  // State variables
  let isRealtime = true
  let intervalId = null
  let allData = []
  let filteredData = []
  const currentPage = 1
  const rowsPerPage = 10
  const refreshRateSelect = document.getElementById("refresh-rate")
  const refreshRate = refreshRateSelect ? Number.parseInt(refreshRateSelect.value) : intervaltime.delay // Default to intervaltime.delay if element not found

  const searchTerm = ""
  let currentTimeRange // Default time range

  // Engine charts
  let engineSpeedChart, engineLoadChart, engineFuelrateChart, engineRunhourChart, engineOilpressureChart

  // Powermeter charts
  let powermeterCurrentChart, powermeterVoltageChart, powermeterRChart, powermeterQChart, powermeterSChart

  // Add these variables at the top of the file, near other state variables
  let enginePowermeterChartIntervalId = null
  let displayUpdateIntervalId = null

  // Combined chart
  let combinedChart

  const currentDataRange = 100 // percentage of data to show

  // Check if Chart.js is loaded
  if (typeof Chart === "undefined") {
    console.error("Chart.js is not loaded! Please check your network connection and reload the page.")
    showNotification("Chart.js library failed to load. Some features may not work correctly.", "error")
  } else {
    console.log("Chart.js is loaded successfully")
  }

  // Initialize charts
  console.log("Initializing charts...")

  // Get chart contexts
  const ch1ChartCtx = document.getElementById("ch1-chart")
  const ch2ChartCtx = document.getElementById("ch2-chart")
  const ch3ChartCtx = document.getElementById("ch3-chart")
  const ch4ChartCtx = document.getElementById("ch4-chart")
  const ch5ChartCtx = document.getElementById("ch5-chart")
  const ch6ChartCtx = document.getElementById("ch6-chart")
  const ch7ChartCtx = document.getElementById("ch7-chart")

  // Get engine chart contexts
  const engineSpeedChartCtx = document.getElementById("engine-speed-chart")
  const engineLoadChartCtx = document.getElementById("engine-load-chart")
  const engineFuelrateChartCtx = document.getElementById("engine-fuelrate-chart")
  const engineRunhourChartCtx = document.getElementById("engine-runhour-chart")
  const engineOilpressureChartCtx = document.getElementById("engine-oilpressure-chart")

  // Get powermeter chart contexts
  const powermeterCurrentChartCtx = document.getElementById("powermeter-current-chart")
  const powermeterVoltageChartCtx = document.getElementById("powermeter-voltage-chart")
  const powermeterRChartCtx = document.getElementById("powermeter-r-chart")
  const powermeterQChartCtx = document.getElementById("powermeter-q-chart")
  const powermeterSChartCtx = document.getElementById("powermeter-s-chart")

  // Check if canvas elements exist
  if (!ch1ChartCtx || !ch2ChartCtx || !ch3ChartCtx || !ch4ChartCtx || !ch5ChartCtx || !ch6ChartCtx || !ch7ChartCtx) {
    console.error("One or more basic chart canvas elements not found!")
  }

  if (
    !engineSpeedChartCtx ||
    !engineLoadChartCtx ||
    !engineFuelrateChartCtx ||
    !engineRunhourChartCtx ||
    !engineOilpressureChartCtx
  ) {
    console.error("One or more engine chart canvas elements not found!")
  }

  if (
    !powermeterCurrentChartCtx ||
    !powermeterVoltageChartCtx ||
    !powermeterRChartCtx ||
    !powermeterQChartCtx ||
    !powermeterSChartCtx
  ) {
    console.error("One or more powermeter chart canvas elements not found!")
  } else {
    console.log("All chart canvas elements found")
  }

  // Small charts configuration
  const smallChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        enabled: true,
      },
    },
    scales: {
      x: {
        display: false,
      },
      y: {
        display: true,
        beginAtZero: false,
      },
    },
    elements: {
      line: {
        tension: 0.4,
      },
      point: {
        radius: 0,
      },
    },
  }

  // Individual chart configuration
  const singleChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        mode: "index",
        intersect: false,
      },
    },
    scales: {
      x: {
        display: true,
        ticks: {
          maxTicksLimit: 5,
          maxRotation: 45,
          minRotation: 45,
        },
        title: {
          display: true,
          text: "Time",
        },
      },
      y: {
        display: true,
        title: {
          display: true,
          text: "Value",
        },
      },
    },
    interaction: {
      mode: "nearest",
      axis: "x",
      intersect: false,
    },
    elements: {
      line: {
        tension: 0.4,
      },
      point: {
        radius: 2,
        hitRadius: 5,
        hoverRadius: 4,
      },
    },
  }

  // Create small charts
  let ch1Chart, ch2Chart, ch3Chart, ch4Chart, ch5Chart, ch6Chart, ch7Chart

try {
    // Inisialisasi Chart Ringkasan Atas
    ch1Chart = new Chart(ch1ChartCtx, { type: "line", data: { labels: [], datasets: [{ label: "CH1", data: [], borderColor: "rgb(59, 130, 246)", backgroundColor: "rgba(59, 130, 246, 0.1)", fill: true, }] }, options: smallChartOptions, });
    ch2Chart = new Chart(ch2ChartCtx, { type: "line", data: { labels: [], datasets: [{ label: "CH2", data: [], borderColor: "rgb(16, 185, 129)", backgroundColor: "rgba(16, 185, 129, 0.1)", fill: true, }] }, options: smallChartOptions, });
    ch3Chart = new Chart(ch3ChartCtx, { type: "line", data: { labels: [], datasets: [{ label: "CH3", data: [], borderColor: "rgb(139, 92, 246)", backgroundColor: "rgba(139, 92, 246, 0.1)", fill: true, }] }, options: smallChartOptions, });
    ch4Chart = new Chart(ch4ChartCtx, { type: "line", data: { labels: [], datasets: [{ label: "ch4", data: [], borderColor: "rgb(246, 92, 92)", backgroundColor: "rgba(246, 92, 92, 0.49)", fill: true, }] }, options: smallChartOptions, });
    ch5Chart = new Chart(ch5ChartCtx, { type: "line", data: { labels: [], datasets: [{ label: "ch5", data: [], borderColor: "rgb(252, 123, 218)", backgroundColor: "rgba(252, 123, 218, 0.38)", fill: true, }] }, options: smallChartOptions, });
    ch6Chart = new Chart(ch6ChartCtx, { type: "line", data: { labels: [], datasets: [{ label: "ch6", data: [], borderColor: "rgb(252, 252, 0)", backgroundColor: "rgba(255, 238, 125, 0.57)", fill: true, }] }, options: smallChartOptions, });
    ch7Chart = new Chart(ch7ChartCtx, { type: "line", data: { labels: [], datasets: [{ label: "ch7", data: [], borderColor: "rgb(179, 179, 179)", backgroundColor: "rgba(179, 179, 179, 0.48)", fill: true, }] }, options: smallChartOptions, });

    // Inisialisasi Stacked Chart dengan dataset untuk interpolasi
    const stackedChartOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false, }, tooltip: { mode: "index", intersect: false, }, }, scales: { x: { display: false, reverse: true, }, y: { display: true, beginAtZero: false, } }, interaction: { mode: "nearest", axis: "x", intersect: false, }, elements: { line: { tension: 0.3, }, point: { radius: 1, hitRadius: 5, hoverRadius: 3, }, }, };
    const trendlineOptions = { backgroundColor: "transparent", fill: false, tension: 0.4, pointRadius: 0, borderWidth: 2, borderDash: [5, 5] };

    stackedch1Chart = new Chart(document.getElementById("ch1-stacked-chart"), { type: "line", data: { labels: [], datasets: [{ label: "CH1", data: [], borderColor: "#3b82f6", backgroundColor: "rgba(59, 130, 246, 0.1)", fill: true }, { label: "Trend CH1", data: [], borderColor: "rgba(2, 92, 185, 0.6)", ...trendlineOptions }] }, options: stackedChartOptions });
    stackedch2Chart = new Chart(document.getElementById("ch2-stacked-chart"), { type: "line", data: { labels: [], datasets: [{ label: "CH2", data: [], borderColor: "#22c55e", backgroundColor: "rgba(34, 197, 94, 0.1)", fill: true }, { label: "Trend CH2", data: [], borderColor: "rgba(21, 128, 61, 0.6)", ...trendlineOptions }] }, options: stackedChartOptions });
    stackedch3Chart = new Chart(document.getElementById("ch3-stacked-chart"), { type: "line", data: { labels: [], datasets: [{ label: "CH3", data: [], borderColor: "#a855f7", backgroundColor: "rgba(168, 85, 247, 0.1)", fill: true }, { label: "Trend CH3", data: [], borderColor: "rgba(126, 34, 206, 0.6)", ...trendlineOptions }] }, options: stackedChartOptions });
    stackedch4Chart = new Chart(document.getElementById("ch4-stacked-chart"), { type: "line", data: { labels: [], datasets: [{ label: "CH4", data: [], borderColor: "#ef4444", backgroundColor: "rgba(239, 68, 68, 0.1)", fill: true }, { label: "Trend CH4", data: [], borderColor: "rgba(185, 28, 28, 0.6)", ...trendlineOptions }] }, options: stackedChartOptions });
    stackedch5Chart = new Chart(document.getElementById("ch5-stacked-chart"), { type: "line", data: { labels: [], datasets: [{ label: "CH5", data: [], borderColor: "#ec4899", backgroundColor: "rgba(236, 72, 153, 0.1)", fill: true }, { label: "Trend CH5", data: [], borderColor: "rgba(190, 24, 93, 0.6)", ...trendlineOptions }] }, options: stackedChartOptions });
    stackedch6Chart = new Chart(document.getElementById("ch6-stacked-chart"), { type: "line", data: { labels: [], datasets: [{ label: "CH6", data: [], borderColor: "#eab308", backgroundColor: "rgba(234, 179, 8, 0.1)", fill: true }, { label: "Trend CH6", data: [], borderColor: "rgba(180, 83, 9, 0.6)", ...trendlineOptions }] }, options: stackedChartOptions });
    stackedch7Chart = new Chart(document.getElementById("ch7-stacked-chart"), { type: "line", data: { labels: [], datasets: [{ label: "CH7", data: [], borderColor: "#6b7280", backgroundColor: "rgba(107, 114, 128, 0.1)", fill: true }, { label: "Trend CH7", data: [], borderColor: "rgba(55, 65, 81, 0.6)", ...trendlineOptions }] }, options: stackedChartOptions });

    // Initialize Engine Charts
    engineSpeedChart = new Chart(engineSpeedChartCtx, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: "Speed",
            data: [],
            borderColor: "rgb(255, 99, 132)",
            backgroundColor: "rgba(255, 99, 132, 0.1)",
            fill: false,
            tension: 0.4,
          },
        ],
      },
      options: singleChartOptions,
    })

    engineLoadChart = new Chart(engineLoadChartCtx, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: "Load",
            data: [],
            borderColor: "rgb(54, 162, 235)",
            backgroundColor: "rgba(54, 162, 235, 0.1)",
            fill: false,
            tension: 0.4,
          },
        ],
      },
      options: singleChartOptions,
      scales: {
        x: {},
      },
    })

    engineFuelrateChart = new Chart(engineFuelrateChartCtx, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: "Fuel Rate",
            data: [],
            borderColor: "rgb(255, 206, 86)",
            backgroundColor: "rgba(255, 206, 86, 0.1)",
            fill: false,
            tension: 0.4,
          },
        ],
      },
      options: singleChartOptions,
    })

    engineRunhourChart = new Chart(engineRunhourChartCtx, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: "Run Hour",
            data: [],
            borderColor: "rgb(75, 192, 192)",
            backgroundColor: "rgba(75, 192, 192, 0.1)",
            fill: false,
            tension: 0.4,
          },
        ],
      },
      options: singleChartOptions,
    })

    engineOilpressureChart = new Chart(engineOilpressureChartCtx, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: "Oil Pressure",
            data: [],
            borderColor: "rgb(153, 102, 255)",
            backgroundColor: "rgba(153, 102, 255, 0.1)",
            fill: false,
            tension: 0.4,
          },
        ],
      },
      options: singleChartOptions,
    })

    // Initialize Powermeter Charts
    powermeterCurrentChart = new Chart(powermeterCurrentChartCtx, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: "Current",
            data: [],
            borderColor: "rgb(54, 162, 235)",
            backgroundColor: "rgba(54, 162, 235, 0.1)",
            fill: false,
            tension: 0.4,
          },
        ],
      },
      options: singleChartOptions,
    })

    powermeterVoltageChart = new Chart(powermeterVoltageChartCtx, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: "Voltage",
            data: [],
            borderColor: "rgb(255, 99, 132)",
            backgroundColor: "rgba(255, 99, 132, 0.1)",
            fill: false,
            tension: 0.4,
          },
        ],
      },
      options: singleChartOptions,
    })

    powermeterRChart = new Chart(powermeterRChartCtx, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: "R",
            data: [],
            borderColor: "rgb(255, 206, 86)",
            backgroundColor: "rgba(255, 206, 86, 0.1)",
            fill: false,
            tension: 0.4,
          },
        ],
      },
      options: singleChartOptions,
    })

    powermeterQChart = new Chart(powermeterQChartCtx, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: "Q",
            data: [],
            borderColor: "rgb(75, 192, 192)",
            backgroundColor: "rgba(75, 192, 192, 0.1)",
            fill: false,
            tension: 0.4,
          },
        ],
      },
      options: singleChartOptions,
    })

    powermeterSChart = new Chart(powermeterSChartCtx, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: "S",
            data: [],
            borderColor: "rgb(153, 102, 255)",
            backgroundColor: "rgba(153, 102, 255, 0.1)",
            fill: false,
            tension: 0.4,
          },
        ],
      },
      options: singleChartOptions,
    })
  } catch (error) {
    console.error("Error initializing charts:", error)
    showNotification("Failed to initialize charts. Please check console for details.", "error")
  }

  // Helper functions
  function showNotification(message, type = "info") {
    const notification = document.getElementById("notification")
    if (!notification) return

    // Set the message
    notification.textContent = message

    // Set the appropriate classes based on type
    notification.className = "mb-4 p-4 rounded-lg font-medium"

    switch (type) {
      case "success":
        notification.className += " bg-green-100 text-green-800 border border-green-200"
        break
      case "error":
        notification.className += " bg-red-100 text-red-800 border border-red-200"
        break
      case "info":
        notification.className += " bg-blue-100 text-blue-800 border border-blue-200"
        break
      case "warning":
        notification.className += " bg-yellow-100 text-yellow-800 border border-yellow-200"
        break
      default:
        notification.className += " bg-gray-100 text-gray-800 border border-gray-200"
    }

    // Show the notification
    notification.classList.remove("hidden")

    // Auto-hide after 5 seconds for success/info, 8 seconds for errors
    const hideDelay = type === "error" ? 8000 : 5000
    setTimeout(() => {
      notification.classList.add("hidden")
    }, hideDelay)
  }

  function filterData() {
    if (!searchTerm) return allData

    return allData.filter((row) => {
      return Object.values(row).some((value) => String(value).toLowerCase().includes(searchTerm.toLowerCase()))
    })
  }



function updateCombinedChart() { 
    if (!stackedch1Chart) {
        console.log("Stacked charts belum siap.");
        return;
    }

  
    const chronologicalData = [...allData].reverse();
    if (chronologicalData.length === 0) return;

    console.log(`RENDER STACKED: Menggambar ${chronologicalData.length} data.`);

    const labels = chronologicalData.map(row => `${row.date} ${row.time}`);
    const ch1Data = chronologicalData.map(row => row.ch1);
    const ch2Data = chronologicalData.map(row => row.ch2);
    const ch3Data = chronologicalData.map(row => row.ch3);
    const ch4Data = chronologicalData.map(row => row.ch4);
    const ch5Data = chronologicalData.map(row => row.ch5);
    const ch6Data = chronologicalData.map(row => row.ch6);
    const ch7Data = chronologicalData.map(row => row.ch7);


    const windowSize = Math.max(5, Math.floor(chronologicalData.length / 15));
    const ch1SMA = simpleMovingAverage(ch1Data, windowSize);
    const ch2SMA = simpleMovingAverage(ch2Data, windowSize);
    const ch3SMA = simpleMovingAverage(ch3Data, windowSize);
    const ch4SMA = simpleMovingAverage(ch4Data, windowSize);
    const ch5SMA = simpleMovingAverage(ch5Data, windowSize);
    const ch6SMA = simpleMovingAverage(ch6Data, windowSize);
    const ch7SMA = simpleMovingAverage(ch7Data, windowSize);

    const chartUpdateData = [
        { chart: stackedch1Chart, data: ch1Data, sma: ch1SMA },
        { chart: stackedch2Chart, data: ch2Data, sma: ch2SMA },
        { chart: stackedch3Chart, data: ch3Data, sma: ch3SMA },
        { chart: stackedch4Chart, data: ch4Data, sma: ch4SMA },
        { chart: stackedch5Chart, data: ch5Data, sma: ch5SMA },
        { chart: stackedch6Chart, data: ch6Data, sma: ch6SMA },
        { chart: stackedch7Chart, data: ch7Data, sma: ch7SMA },
    ];

    chartUpdateData.forEach(item => {
        if (item.chart) { 
            item.chart.data.labels = labels;
            item.chart.data.datasets[0].data = item.data;
            item.chart.data.datasets[1].data = item.sma;
            item.chart.update("none");
        }
    });
}


  let isSynced = true
  let sharedTimeline = []

  function syncCharts() {
    isSynced = !isSynced
    const syncBtn = document.querySelector('button[onclick="syncCharts()"]')

    if (isSynced) {
      syncBtn.classList.remove("bg-gray-200", "text-gray-800")
      syncBtn.classList.add("bg-blue-600", "text-white")
      syncBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        Synced
      `
    } else {
      syncBtn.classList.remove("bg-blue-600", "text-white")
      syncBtn.classList.add("bg-gray-200", "text-gray-800")
      syncBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
        Unsynced
      `
    }
    updateAllCharts()
  }

  function updateAllCharts() {
    if (isSynced) {
      // Get the longest dataset for synchronization
      const maxLength = Math.max(
        stackedch1Chart.data.labels.length,
        stackedch2Chart.data.labels.length,
        stackedch3Chart.data.labels.length,
        stackedch4Chart.data.labels.length,
        stackedch5Chart.data.labels.length,
        stackedch6Chart.data.labels.length,
        stackedch7Chart.data.labels.length,
      )

      // Use the most complete timeline
      sharedTimeline =
        stackedch1Chart.data.labels.length === maxLength
          ? [...stackedch1Chart.data.labels]
          : stackedch2Chart.data.labels.length === maxLength
            ? [...stackedch2Chart.data.labels]
            : stackedch3Chart.data.labels.length === maxLength
              ? [...stackedch3Chart.data.labels]
              : stackedch4Chart.data.labels.length === maxLength
                ? [...stackedch5Chart.data.labels]
                : stackedch6Chart.data.labels.length === maxLength
                  ? [...stackedch6Chart.data.labels]
                  : [...stackedch7Chart.data.labels]

      // Apply to all charts
      stackedch1Chart.data.labels = sharedTimeline
      stackedch2Chart.data.labels = sharedTimeline
      stackedch3Chart.data.labels = sharedTimeline
      stackedch4Chart.data.labels = sharedTimeline
      stackedch5Chart.data.labels = sharedTimeline
      stackedch6Chart.data.labels = sharedTimeline
      stackedch7Chart.data.labels = sharedTimeline
    }

    stackedch1Chart.update()
    stackedch2Chart.update()
    stackedch3Chart.update()
    stackedch4Chart.update()
    stackedch5Chart.update()
    stackedch6Chart.update()
    stackedch7Chart.update()
  }

  // Function to update Engine charts
  function updateEngineCharts() {
    // Get current timestamp for the x-axis
    if (!engineSpeedChart) return;
    const now = new Date()
    const timeString = now.toTimeString().split(" ")[0]

    // Update Engine Charts
    fetch("/api/engine-data")
      .then((response) => response.json())
      .then((data) => {
        if (data && data.length) {
          // Common time operations for all engine charts
          const maxPoints = 20

          // Engine Speed Chart
          if (engineSpeedChart.data.labels.length > maxPoints) {
            engineSpeedChart.data.labels.pop()
            engineSpeedChart.data.datasets[0].data.pop()
          }
          engineSpeedChart.data.labels.unshift(timeString)
          const speedValue = data[0]?.value || 0
          engineSpeedChart.data.datasets[0].data.unshift(speedValue)
          // Update value display

          engineSpeedChart.update()
          document.getElementById("engine-speed-value").textContent = speedValue.toFixed(2)

          // Check threshold
          if (speedValue > warningThresholds.e_speed) {
            showWarningPopup("Engine Speed", speedValue, warningThresholds.e_speed)
          }

          // Engine Load Chart
          if (engineLoadChart.data.labels.length > maxPoints) {
            engineLoadChart.data.labels.pop()
            engineLoadChart.data.datasets[0].data.pop()
          }
          engineLoadChart.data.labels.unshift(timeString)
          const loadValue = data[1]?.value || 0
          engineLoadChart.data.datasets[0].data.unshift(loadValue)
          // Update value display

          engineLoadChart.update()
          document.getElementById("engine-load-value").textContent = loadValue.toFixed(2)

          // Check threshold
          if (loadValue > warningThresholds.e_load) {
            showWarningPopup("Engine Load", loadValue, warningThresholds.e_load)
          }

          // Engine Fuel Rate Chart
          if (engineFuelrateChart.data.labels.length > maxPoints) {
            engineFuelrateChart.data.labels.pop()
            engineFuelrateChart.data.datasets[0].data.pop()
          }
          engineFuelrateChart.data.labels.unshift(timeString)
          const fuelrateValue = data[2]?.value || 0
          engineFuelrateChart.data.datasets[0].data.unshift(fuelrateValue)
          // Update value display

          engineFuelrateChart.update()
          document.getElementById("engine-fuelrate-value").textContent = fuelrateValue.toFixed(2)

          // Check threshold
          if (fuelrateValue > warningThresholds.e_fuelrate) {
            showWarningPopup("Engine Fuel Rate", fuelrateValue, warningThresholds.e_fuelrate)
          }

          // Engine Run Hour Chart
          if (engineRunhourChart.data.labels.length > maxPoints) {
            engineRunhourChart.data.labels.pop()
            engineRunhourChart.data.datasets[0].data.pop()
          }
          engineRunhourChart.data.labels.unshift(timeString)
          const runhourValue = data[3]?.value || 0
          engineRunhourChart.data.datasets[0].data.unshift(runhourValue)
          // Update value display

          engineRunhourChart.update()
          document.getElementById("engine-runhour-value").textContent = runhourValue.toFixed(2)

          // Check threshold for run hours
          if (runhourValue > warningThresholds.e_runhour) {
            showWarningPopup("Engine Run Hours", runhourValue, warningThresholds.e_runhour)
          }

          // Engine Oil Pressure Chart
          if (engineOilpressureChart.data.labels.length > maxPoints) {
            engineOilpressureChart.data.labels.pop()
            engineOilpressureChart.data.datasets[0].data.pop()
          }
          engineOilpressureChart.data.labels.unshift(timeString)
          const oilpressureValue = data[4]?.value || 0
          engineOilpressureChart.data.datasets[0].data.unshift(oilpressureValue)
          // Update value display

          engineOilpressureChart.update()
          document.getElementById("engine-oilpressure-value").textContent = oilpressureValue.toFixed(2)

          // Check threshold
          if (oilpressureValue > warningThresholds.e_oilpressure) {
            showWarningPopup("Engine Oil Pressure", oilpressureValue, warningThresholds.e_oilpressure)
          }
        }
      })
      .catch((error) => {
        console.error("Error fetching engine data:", error)
      })
  }

  // Modify updatePowermeterCharts to check thresholds after updating
  function updatePowermeterCharts() {
    // Get current timestamp for the x-axis
    if (!powermeterCurrentChart) return;
    const now = new Date()
    const timeString = now.toTimeString().split(" ")[0]

    // Update Powermeter Charts
    fetch("/api/powermeter-data")
      .then((response) => response.json())
      .then((data) => {
        if (data && data.length) {
          // Common time operations for all powermeter charts
          const maxPoints = 20

          // Current Chart
          if (powermeterCurrentChart.data.labels.length > maxPoints) {
            powermeterCurrentChart.data.labels.pop()
            powermeterCurrentChart.data.datasets[0].data.pop()
          }
          powermeterCurrentChart.data.labels.unshift(timeString)
          const currentValue = data[0]?.value || 0
          powermeterCurrentChart.data.datasets[0].data.unshift(currentValue)
          // Update value display

          powermeterCurrentChart.update()
          document.getElementById("powermeter-current-value").textContent = currentValue.toFixed(2)

          // Check threshold
          if (currentValue > warningThresholds.pm_current) {
            showWarningPopup("Powermeter Current", currentValue, warningThresholds.pm_current)
          }

          // Voltage Chart
          if (powermeterVoltageChart.data.labels.length > maxPoints) {
            powermeterVoltageChart.data.labels.pop()
            powermeterVoltageChart.data.datasets[0].data.pop()
          }
          powermeterVoltageChart.data.labels.unshift(timeString)
          const voltageValue = data[1]?.value || 0
          powermeterVoltageChart.data.datasets[0].data.unshift(voltageValue)
          // Update value display

          powermeterVoltageChart.update()
          document.getElementById("powermeter-voltage-value").textContent = voltageValue.toFixed(2)

          // Check threshold
          if (voltageValue > warningThresholds.pm_voltage) {
            showWarningPopup("Powermeter Voltage", voltageValue, warningThresholds.pm_voltage)
          }

          // R Chart
          if (powermeterRChart.data.labels.length > maxPoints) {
            powermeterRChart.data.labels.pop()
            powermeterRChart.data.datasets[0].data.pop()
          }
          powermeterRChart.data.labels.unshift(timeString)
          const rValue = data[2]?.value || 0
          powermeterRChart.data.datasets[0].data.unshift(rValue)
          // Update value display

          powermeterRChart.update()
          document.getElementById("powermeter-r-value").textContent = rValue.toFixed(2)

          // Check threshold
          if (rValue > warningThresholds.pm_r) {
            showWarningPopup("Powermeter R", rValue, warningThresholds.pm_r)
          }

          // Q Chart
          if (powermeterQChart.data.labels.length > maxPoints) {
            powermeterQChart.data.labels.pop()
            powermeterQChart.data.datasets[0].data.pop()
          }
          powermeterQChart.data.labels.unshift(timeString)
          const qValue = data[3]?.value || 0
          powermeterQChart.data.datasets[0].data.unshift(qValue)
          // Update value display

          powermeterQChart.update()
          document.getElementById("powermeter-q-value").textContent = qValue.toFixed(2)

          // Check threshold
          if (qValue > warningThresholds.pm_q) {
            showWarningPopup("Powermeter Q", qValue, warningThresholds.pm_q)
          }

          // S Chart
          if (powermeterSChart.data.labels.length > maxPoints) {
            powermeterSChart.data.labels.pop()
            powermeterSChart.data.datasets[0].data.pop()
          }
          powermeterSChart.data.labels.unshift(timeString)
          const sValue = data[4]?.value || 0
          powermeterSChart.data.datasets[0].data.unshift(sValue)
          // Update value display

          powermeterSChart.update()
          document.getElementById("powermeter-s-value").textContent = sValue.toFixed(2)

          // Check threshold
          if (sValue > warningThresholds.pm_s) {
            showWarningPopup("Powermeter S", sValue, warningThresholds.pm_s)
          }
        }
      })
      .catch((error) => {
        console.error("Error fetching powermeter data:", error)
      })
  }



function updateCharts() {
    const summaryData = allData.slice(0, 10);
    if (summaryData.length === 0) return;
    console.log("Memperbarui grafik ringkasan atas...");
    const chronologicalSummary = [...summaryData].reverse();
    const summaryLabels = chronologicalSummary.map((row) => row.time);
    const summaryCharts = [
        { chart: ch1Chart, data: chronologicalSummary.map((row) => row.ch1) },
        { chart: ch2Chart, data: chronologicalSummary.map((row) => row.ch2) },
        { chart: ch3Chart, data: chronologicalSummary.map((row) => row.ch3) },
        { chart: ch4Chart, data: chronologicalSummary.map((row) => row.ch4) },
        { chart: ch5Chart, data: chronologicalSummary.map((row) => row.ch5) },
        { chart: ch6Chart, data: chronologicalSummary.map((row) => row.ch6) },
        { chart: ch7Chart, data: chronologicalSummary.map((row) => row.ch7) },
    ];

    // Update setiap grafik ringkasan
    summaryCharts.forEach(c => {
        if (c.chart) {
            c.chart.data.labels = summaryLabels;
            c.chart.data.datasets[0].data = c.data;
            c.chart.update('none'); 
        }
    });

    const latestData = allData[0];
    if (latestData) {
        ch1Value.textContent = formatSensorValue(latestData.ch1, "ch1");
        ch2Value.textContent = formatSensorValue(latestData.ch2, "ch2");
        ch3Value.textContent = formatSensorValue(latestData.ch3, "ch3");
        ch4Value.textContent = formatSensorValue(latestData.ch4, "ch4");
        ch5Value.textContent = formatSensorValue(latestData.ch5, "ch5");
        ch6Value.textContent = formatSensorValue(latestData.ch6, "ch6");
        ch7Value.textContent = formatSensorValue(latestData.ch7, "ch7");

        const timeStr = `${latestData.date} ${latestData.time}`;
        ch1Updated.textContent = timeStr;
        ch2Updated.textContent = timeStr;
        ch3Updated.textContent = timeStr;
        ch4Updated.textContent = timeStr;
        ch5Updated.textContent = timeStr;
        ch6Updated.textContent = timeStr;
        ch7Updated.textContent = timeStr;
        checkWarningThresholds(latestData);
    }
    
    updateEngineCharts();
    updatePowermeterCharts();
}


  function renderTable() {
    const filteredDataToUse = isRealtime ? filterData() : filteredData

    const dataCount = Math.max(5, Math.floor((filteredDataToUse.length * currentDataRange) / 100))
    const rangeFilteredData = filteredDataToUse.slice(0, dataCount)

    const startIndex = (currentPage - 1) * rowsPerPage
    const endIndex = startIndex + rowsPerPage
    const paginatedData = rangeFilteredData.slice(startIndex, endIndex)

    dataTable.innerHTML = ""

    if (paginatedData.length === 0) {
      dataTable.innerHTML = `<tr><td colspan="10" class="px-6 py-4 text-center text-gray-500">No data available</td></tr>`
    } else {
      paginatedData.forEach((row, index) => {
        const rowNumber = row.id || allData.findIndex((d) => d.date === row.date && d.time === row.time) + 1
        const tr = document.createElement("tr")
        tr.className = "hover:bg-gray-50"
        tr.innerHTML = `
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${rowNumber}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${row.date}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${row.time}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-blue-600">${formatSensorValue(row.ch1, "ch1")}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600">${formatSensorValue(row.ch2, "ch2")}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-purple-600">${formatSensorValue(row.ch3, "ch3")}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-red-600">${formatSensorValue(row.ch4, "ch4")}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-pink-600">${formatSensorValue(row.ch5, "ch5")}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-yellow-600">${formatSensorValue(row.ch6, "ch6")}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-grey-600">${formatSensorValue(row.ch7, "ch7")}</td>
      `
        dataTable.appendChild(tr)
      })
    }
  }

// GANTI FUNGSI fetchData DENGAN INI
function fetchData() {
    const intervalForAPI = Math.round(currentServerInterval / 1000); // Konversi ms ke detik

    console.log(`FETCH: Meminta data untuk range '${currentTimeRange}' dengan interval display '${intervalForAPI}s'`);

    // Kirim 'range' dan 'interval' ke backend
    fetch(`/api/all-data?range=${currentTimeRange}&interval=${intervalForAPI}`)
        .then(response => response.json())
        .then(data => {
            allData = data;
            updateStatusIndicator(true);
            renderTable();
            updateCharts();
            updateCombinedChart();
        })
        .catch(error => {
            console.error("Gagal mengambil data:", error);
            updateStatusIndicator(false);
        });
}

  // Add this function to check for warning conditions
  function checkWarningThresholds(data) {
    // Check powermeter data
    if (data.powermeter) {
      if (data.powermeter.voltage > warningThresholds.pm_voltage) {
        showWarningPopup("Powermeter Voltage", data.powermeter.voltage, warningThresholds.pm_voltage)
        return
      }
      if (data.powermeter.current > warningThresholds.pm_current) {
        showWarningPopup("Powermeter Current", data.powermeter.current, warningThresholds.pm_current)
        return
      }
      if (data.powermeter.r > warningThresholds.pm_r) {
        showWarningPopup("Powermeter R", data.powermeter.r, warningThresholds.pm_r)
        return
      }
      if (data.powermeter.q > warningThresholds.pm_q) {
        showWarningPopup("Powermeter Q", data.powermeter.q, warningThresholds.pm_q)
        return
      }
      if (data.powermeter.s > warningThresholds.pm_s) {
        showWarningPopup("Powermeter S", data.powermeter.s, warningThresholds.pm_s)
        return
      }
    }

    // Check engine data
    if (data.engine) {
      if (data.engine.speed > warningThresholds.e_speed) {
        showWarningPopup("Engine Speed", data.engine.speed, warningThresholds.e_speed)
        return
      }
      if (data.engine.load > warningThresholds.e_load) {
        showWarningPopup("Engine Load", data.engine.load, warningThresholds.e_load)
        return
      }
      if (data.engine.fuelrate > warningThresholds.e_fuelrate) {
        showWarningPopup("Engine Fuel Rate", data.engine.fuelrate, warningThresholds.e_fuelrate)
        return
      }
      if (data.engine.runhour > warningThresholds.e_runhour) {
        showWarningPopup("Engine Run Hours", data.engine.runhour, warningThresholds.e_runhour)
        return
      }
      if (data.engine.oilpressure > warningThresholds.e_oilpressure) {
        showWarningPopup("Engine Oil Pressure", data.engine.oilpressure, warningThresholds.e_oilpressure)
        return
      }
    }

    // Check basic sensor data
    if (data.ch1 > warningThresholds.ch1) {
      showWarningPopup(selectedSensors.ch1, data.ch1, warningThresholds.ch1)
      return
    }
    if (data.ch2 > warningThresholds.ch2) {
      showWarningPopup(selectedSensors.ch2, data.ch2, warningThresholds.ch2)
      return
    }
    if (data.ch3 > warningThresholds.ch3) {
      showWarningPopup(selectedSensors.ch3, data.ch3, warningThresholds.ch3)
      return
    }
    if (data.ch4 > warningThresholds.ch4) {
      showWarningPopup(selectedSensors.ch4, data.ch4, warningThresholds.ch4)
      return
    }
    if (data.ch5 > warningThresholds.ch5) {
      showWarningPopup(selectedSensors.ch5, data.ch5, warningThresholds.ch5)
      return
    }
    if (data.ch6 > warningThresholds.ch6) {
      showWarningPopup(selectedSensors.ch6, data.ch6, warningThresholds.ch6)
      return
    }
    if (data.ch7 > warningThresholds.ch7) {
      showWarningPopup(selectedSensors.ch7, data.ch7, warningThresholds.ch7)
      return
    }
  }


// GANTI SELURUH FUNGSI setupChartPopup DENGAN VERSI BARU INI

function setupChartPopup() {
    const popup = document.getElementById('chart-popup');
    const closeBtn = document.getElementById('popup-close-btn');
    const popupTitle = document.getElementById('popup-chart-title');
    const popupCanvas = document.getElementById('popup-chart-canvas');
    const popupTimeRangeSelector = document.getElementById('popup-time-range');

    if (!popup || !closeBtn || !popupCanvas || !popupTimeRangeSelector) {
        console.error("Elemen-elemen popup tidak ditemukan di index.html!");
        return;
    }

    let modalChart = null;

    const updateModalChartData = (chartData) => {
        if (!modalChart) return;
        const chronologicalData = [...chartData].reverse();
        const labels = chronologicalData.map(row => `${row.date} ${row.time}`);
        const channelKey = modalChart.data.datasets[0].label.toLowerCase();
        const mainData = chronologicalData.map(row => row[channelKey]);
        const windowSize = Math.max(5, Math.floor(chronologicalData.length / 15));
        const smaData = simpleMovingAverage(mainData, windowSize);
        modalChart.data.labels = labels;
        modalChart.data.datasets[0].data = mainData;
        modalChart.data.datasets[1].data = smaData;
        modalChart.update('none');
    };

    const fetchPopupData = (range) => {
        const intervalForAPI = Math.round(currentServerInterval / 1000);
        fetch(`/api/all-data?range=${range}&interval=${intervalForAPI}`)
            .then(response => response.json())
            .then(data => {
                updateModalChartData(data);
            });
    };
    
    popupTimeRangeSelector.addEventListener('change', (e) => {
        fetchPopupData(e.target.value);
    });

    const stackedCharts = [
        stackedch1Chart, stackedch2Chart, stackedch3Chart,
        stackedch4Chart, stackedch5Chart, stackedch6Chart, stackedch7Chart
    ];

    stackedCharts.forEach((chartObject, index) => {
        if (chartObject && chartObject.canvas) {
            chartObject.canvas.style.cursor = 'pointer';
            chartObject.canvas.addEventListener('click', () => {
                if (!chartObject) return;

                const titleElement = document.getElementById(`stacked-ch${index + 1}-title`);
                const dynamicTitle = titleElement ? titleElement.textContent : `CH${index + 1}`;
                popupTitle.textContent = `${dynamicTitle} - Detail View`;
                popup.dataset.chartIndex = index;
                popupTimeRangeSelector.value = currentTimeRange;

                if (modalChart) modalChart.destroy();
                
                modalChart = new Chart(popupCanvas, {
                    type: 'line',
                    data: {
                        labels: chartObject.data.labels,
                        datasets: [
                            { ...chartObject.data.datasets[0] },
                            { ...chartObject.data.datasets[1] }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: true } },
                        scales: { x: { ticks: { autoSkip: true, maxTicksLimit: 20 }, reverse : true }, }
                    }
                });
                
                popup.classList.remove('hidden');
            });
        }
    });

    const closePopup = () => {
        popup.classList.add('hidden');
        if (modalChart) {
            modalChart.destroy();
            modalChart = null;
        }
    };
    closeBtn.addEventListener('click', closePopup);
    popup.addEventListener('click', (e) => {
        if (e.target.id === 'chart-popup') closePopup();
    });
}

  // Add this function to show the warning popup
  function showWarningPopup(sensorName, currentValue, threshold) {
    const warningOverlay = document.getElementById("warning-overlay")
    const warningMessage = document.getElementById("warning-message")
    const warningValue = document.getElementById("warning-value")
    const warningThreshold = document.getElementById("warning-threshold")

    warningMessage.textContent = `${sensorName} has exceeded the safe threshold!`
    warningValue.textContent = currentValue.toFixed(2)
    warningThreshold.textContent = threshold.toFixed(2)

    warningOverlay.classList.remove("hidden")

    // Play warning sound (optional)
    try {
      const audio = new Audio("/static/warning.mp3")
      audio.play()
    } catch (e) {
      console.log("Warning sound not available")
    }
  }

  // Add event listeners for the warning popup buttons
  document.getElementById("close-warning").addEventListener("click", () => {
    document.getElementById("warning-overlay").classList.add("hidden")
  })

  document.getElementById("acknowledge-warning").addEventListener("click", () => {
    document.getElementById("warning-overlay").classList.add("hidden")
  })


window.selectTimeRange = (range) => {
    console.log(`UI: Pengguna mengubah range ke -> ${range}`);
    currentTimeRange = range;
    localStorage.setItem("selectedTimeRange", range);

    fetchData();

    document.querySelectorAll(".time-range-button").forEach((btn) => {
        const buttonRange = btn.getAttribute("data-range");
        btn.classList.toggle("bg-blue-200", buttonRange === range);
        btn.classList.toggle("font-bold", buttonRange === range);
        btn.classList.toggle("bg-blue-100", buttonRange !== range);
    });
};

  // Function to update carousel position
  function updateCarousel(carousel, currentSlide) {
    const slideWidth = carousel.querySelector("div").offsetWidth
    carousel.style.transform = `translateX(-${currentSlide * slideWidth}px)`

    // Trigger chart resize to ensure proper rendering after slide
    setTimeout(() => {
      window.dispatchEvent(new Event("resize"))
    }, 300)
  }

  // Function to update pagination indicators
  function updatePagination(paginationElement, totalSlides, currentSlide) {
    paginationElement.innerHTML = ""
    for (let i = 0; i < totalSlides; i++) {
      const indicator = document.createElement("span")
      indicator.className = `h-2 w-2 rounded-full ${i === currentSlide ? "bg-gray-600" : "bg-gray-300"}`
      paginationElement.appendChild(indicator)

      // Add a small space between indicators
      if (i < totalSlides - 1) {
        const space = document.createElement("span")
        space.className = "w-2"
        paginationElement.appendChild(space)
      }
    }
  }

  // Function to add touch swipe support
  function addSwipeSupport(element, onSwipeRight, onSwipeLeft) {
    let touchStartX = 0
    let touchEndX = 0

    element.addEventListener(
      "touchstart",
      (e) => {
        touchStartX = e.changedTouches[0].screenX
      },
      { passive: true },
    )

    element.addEventListener(
      "touchend",
      (e) => {
        touchEndX = e.changedTouches[0].screenX
        handleSwipe()
      },
      { passive: true },
    )

    function handleSwipe() {
      const swipeThreshold = 50 // Minimum distance for a swipe

      if (touchEndX < touchStartX - swipeThreshold) {
        // Swipe left
        onSwipeLeft()
      }

      if (touchEndX > touchStartX + swipeThreshold) {
        // Swipe right
        onSwipeRight()
      }
    }
  }

  // Initialize carousels
  function initCarousels() {
    // Engine carousel
    const engineCarousel = document.getElementById("engine-carousel")
    const enginePrev = document.getElementById("engine-prev")
    const engineNext = document.getElementById("engine-next")
    const enginePagination = document.getElementById("engine-pagination")

    if (!engineCarousel || !enginePrev || !engineNext || !enginePagination) return

    let engineCurrentSlide = 0
    const engineSlides = engineCarousel.querySelectorAll(".flex-shrink-0")
    const engineTotalSlides = Math.ceil(engineSlides.length - 1) 

    // Powermeter carousel
    const powermeterCarousel = document.getElementById("powermeter-carousel")
    const powermeterPrev = document.getElementById("powermeter-prev")
    const powermeterNext = document.getElementById("powermeter-next")
    const powermeterPagination = document.getElementById("powermeter-pagination")

    if (!powermeterCarousel || !powermeterPrev || !powermeterNext || !powermeterPagination) return

    let powermeterCurrentSlide = 0
    const powermeterSlides = powermeterCarousel.querySelectorAll(".flex-shrink-0")
    const powermeterTotalSlides = Math.ceil(powermeterSlides.length - 1) // 5 charts, showing 2 at a time

    // Initialize pagination indicators
    updatePagination(enginePagination, engineTotalSlides, engineCurrentSlide)
    updatePagination(powermeterPagination, powermeterTotalSlides, powermeterCurrentSlide)

    // Engine carousel navigation with infinite scrolling
    enginePrev.addEventListener("click", () => {
      engineCurrentSlide = (engineCurrentSlide - 1 + engineTotalSlides) % engineTotalSlides
      updateCarousel(engineCarousel, engineCurrentSlide)
      updatePagination(enginePagination, engineTotalSlides, engineCurrentSlide)
    })

    engineNext.addEventListener("click", () => {
      engineCurrentSlide = (engineCurrentSlide + 1) % engineTotalSlides
      updateCarousel(engineCarousel, engineCurrentSlide)
      updatePagination(enginePagination, engineTotalSlides, engineCurrentSlide)
    })

    // Powermeter carousel navigation with infinite scrolling
    powermeterPrev.addEventListener("click", () => {
      powermeterCurrentSlide = (powermeterCurrentSlide - 1 + powermeterTotalSlides) % powermeterTotalSlides
      updateCarousel(powermeterCarousel, powermeterCurrentSlide)
      updatePagination(powermeterPagination, powermeterTotalSlides, powermeterCurrentSlide)
    })

    powermeterNext.addEventListener("click", () => {
      powermeterCurrentSlide = (powermeterCurrentSlide + 1) % powermeterTotalSlides
      updateCarousel(powermeterCarousel, powermeterCurrentSlide)
      updatePagination(powermeterPagination, powermeterTotalSlides, powermeterCurrentSlide)
    })

    // Add touch swipe support with infinite scrolling
    addSwipeSupport(
      engineCarousel,
      () => {
        engineCurrentSlide = (engineCurrentSlide - 1 + engineTotalSlides) % engineTotalSlides
        updateCarousel(engineCarousel, engineCurrentSlide)
        updatePagination(enginePagination, engineTotalSlides, engineCurrentSlide)
      },
      () => {
        engineCurrentSlide = (engineCurrentSlide + 1) % engineTotalSlides
        updateCarousel(engineCarousel, engineCurrentSlide)
        updatePagination(enginePagination, engineTotalSlides, engineCurrentSlide)
      },
    )

    addSwipeSupport(powermeterCarousel, () => {
      powermeterCurrentSlide = (powermeterCurrentSlide - 1 + powermeterTotalSlides) % powermeterTotalSlides
      updateCarousel(powermeterCarousel, powermeterCurrentSlide)
      updatePagination(powermeterPagination, powermeterTotalSlides, powermeterCurrentSlide)
    })

    // Initial update to ensure charts are visible
    updateCarousel(engineCarousel, engineCurrentSlide)
    updateCarousel(powermeterCarousel, powermeterCurrentSlide)
  }

  // Function to download chart as PDF
  window.downloadChartAsPDF = () => {
    const chartContainer = document.getElementById("combined-chart").parentElement

    // Import necessary libraries for PDF generation
    import("html2canvas").then((module) => {
      const html2canvas = module.default
      import("jspdf").then((module) => {
        const jspdf = module.jsPDF

        html2canvas(chartContainer).then((canvas) => {
          const imgData = canvas.toDataURL("image/png")
          const pdf = new jspdf({
            orientation: "landscape",
            unit: "mm",
          })

          const imgWidth = 280
          const imgHeight = (canvas.height * imgWidth) / canvas.width

          pdf.addImage(imgData, "PNG", 10, 10, imgWidth, imgHeight)
          pdf.save("chart.pdf")

          showNotification("Chart downloaded as PDF", "success")
        })
      })
    })
  }

  // Event listeners
  // Start button event handler
  if (startButton) {
    startButton.addEventListener("click", async () => {
      console.log("Start button clicked")
      startButton.disabled = true
      startButton.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Starting...'

      // In the start button event handler, replace the interval starting code with:
      fetch("/start", { method: "POST" })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`)
          }
          return response.json()
        })
        .then(async (data) => {
          console.log("Data received:", data)
          showNotification("Data logging started successfully", "success")

          // Get current server interval
          await getCurrentInterval()

          // Start all intervals with server timing
          if (intervalId) clearInterval(intervalId)
          intervalId = setInterval(() => {
            fetchData()
          }, currentServerInterval) // Use server interval instead of refreshRate

          if (enginePowermeterChartIntervalId) clearInterval(enginePowermeterChartIntervalId)
          updateEngineCharts()
          updatePowermeterCharts()
          enginePowermeterChartIntervalId = setInterval(() => {
            updateEngineCharts()
            updatePowermeterCharts()
          }, currentServerInterval)

          if (displayUpdateIntervalId) clearInterval(displayUpdateIntervalId)
          loadPowermeterDisplay()
          loadEngineDisplay()
          displayUpdateIntervalId = setInterval(() => {
            loadPowermeterDisplay()
            loadEngineDisplay()
          }, currentServerInterval)

          // ... rest of existing code ...
          startButton.classList.remove("btn-primary")
          startButton.classList.add("btn-disabled")
          updateStatusIndicator(true)

          // Jalankan ulang interval data utama
          if (intervalId) clearInterval(intervalId)
          intervalId = setInterval(() => {
            fetchData()
          }, refreshRate)

          // Jalankan ulang interval chart engine dan powermeter
          if (enginePowermeterChartIntervalId) clearInterval(enginePowermeterChartIntervalId)
          updateEngineCharts()
          updatePowermeterCharts()
          enginePowermeterChartIntervalId = setInterval(() => {
            updateEngineCharts()
            updatePowermeterCharts()
          }, intervaltime.delay)

          // Jalankan ulang display engine & powermeter
          if (displayUpdateIntervalId) clearInterval(displayUpdateIntervalId)
          loadPowermeterDisplay()
          loadEngineDisplay()
          displayUpdateIntervalId = setInterval(() => {
            loadPowermeterDisplay()
            loadEngineDisplay()
          }, intervaltime.delay)

          isRealtime = true
          updateCombinedChart()
          renderTable()

          // FINAL STATE SETTING
          startButton.disabled = true
          startButton.innerHTML = '<i class="fas fa-play mr-2"></i> Start'
          startButton.classList.remove("btn-primary")
          startButton.classList.add("btn-disabled")
          stopButton.disabled = false
        })
        .catch((error) => {
          console.error("Error starting data logging:", error)
          showNotification("Failed to start data logging: " + error.message, "error")
          startButton.disabled = false
          startButton.innerHTML = '<i class="fas fa-play mr-2"></i> Start'
        })
    })
  }

  // Stop button event listener (for reference)
  if (stopButton) {
    stopButton.addEventListener("click", () => {
      console.log("Stop button clicked")
      stopButton.disabled = true
      startButton.classList.add("btn-primary")
      startButton.classList.remove("btn-disabled")
      stopButton.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Stopping...'

      fetch("/stop", { method: "POST" })
        .then(() => {
          return fetch("/set-system-state", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ running: false }),
          })
        })
        .then(() => {
          showNotification("Data logging stopped", "success")
          updateStatusIndicator(false)

          // Hentikan semua interval
          clearInterval(intervalId)
          clearInterval(enginePowermeterChartIntervalId)
          clearInterval(displayUpdateIntervalId)

          // Reset UI
          startButton.disabled = false
          stopButton.disabled = true
          startButton.innerHTML = '<i class="fas fa-play mr-2"></i> Start'
          stopButton.innerHTML = '<i class="fas fa-stop mr-2"></i> Stop'
        })
        .catch((error) => {
          console.error("Error stopping data logging:", error)
          showNotification("Failed to stop data logging: " + error.message, "error")
          stopButton.disabled = false
          stopButton.innerHTML = '<i class="fas fa-stop mr-2"></i> Stop'
        })
    })
  }

  document.getElementById("clear").addEventListener("click", () => {
    if (confirm("Are you sure you want to clear all log data?")) {
      fetch("/clear-log", {
        method: "POST",
      })
        .then((res) => res.json())
        .then((data) => {
          alert(data.message)
          // Optional: Kosongkan isi tabel HTML juga
          document.getElementById("data-table").innerHTML = `
                <tr>
                    <td colspan="6" class="px-4 py-2 text-center text-gray-500">No data available</td>
                </tr>
            `
        })
        .catch((err) => {
          console.error("Error clearing data:", err)
          alert("Gagal menghapus log data.")
        })
    }
  })

  // Add event listener for download buttons
  const downloadLocalButton = document.getElementById("download-local")
  if (downloadLocalButton) {
    downloadLocalButton.addEventListener("click", () => {
      // Show loading notification
      showNotification('ðŸ"„ Preparing local download...', "info")

      // Disable button temporarily
      downloadLocalButton.disabled = true
      downloadLocalButton.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Downloading...'

      // Create a temporary link to trigger download
      const link = document.createElement("a")
      link.href = "/download/local"
      link.download = ""
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      // Show success notification after a short delay
      setTimeout(() => {
        showNotification("âœ… Local download started successfully!", "success")

        // Re-enable button
        downloadLocalButton.disabled = false
        downloadLocalButton.innerHTML = '<i class="fas fa-download mr-2"></i> Download Local'
      }, 1000)
    })
  }

  const downloadUsbButton = document.getElementById("download-usb")
  if (downloadUsbButton) {
    downloadUsbButton.addEventListener("click", () => {
      // Show loading notification
      showNotification('ðŸ"„ Starting USB download process...', "info")

      // Disable button temporarily
      downloadUsbButton.disabled = true
      downloadUsbButton.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Processing...'

      fetch("/download/usb")
        .then((response) => response.json())
        .then((data) => {
          if (data.status === "success") {
            showNotification(`âœ… ${data.message}`, "success")
            console.log(`USB Download Details:
            - Filename: ${data.filename}
            - Records: ${data.records}
            - USB Path: ${data.usb_path}`)
          } else {
            showNotification(`âŒ ${data.message}`, "error")
          }
        })
        .catch((error) => {
          console.error("Error downloading to USB:", error)
          showNotification("âŒ Failed to download to USB. Please check console for details.", "error")
        })
        .finally(() => {
          // Re-enable button
          downloadUsbButton.disabled = false
          downloadUsbButton.innerHTML = '<i class="fas fa-save mr-2"></i> Download to USB'
        })
    })
  }

  // Event listener for time range buttons
  document.querySelectorAll(".time-range-button").forEach((button) => {
    button.addEventListener("click", function () {
      const range = this.getAttribute("data-range")
      selectTimeRange(range)
    })
  })

  initSidebar();
  initTabs();
  initForms();
  setupChartPopup();
  initCarousels(); 


  try {
    console.log("Semua objek chart telah diinisialisasi.");

  } catch (error) {
      console.error("Gagal saat inisialisasi chart awal:", error);
  }

  async function startApp() {
    await getCurrentInterval();

    const savedTimeRange = localStorage.getItem("selectedTimeRange");
    currentTimeRange = savedTimeRange;

    selectTimeRange(savedTimeRange);
    checkSystemState();
    fetchData();

    document.querySelectorAll(".time-range-btn").forEach(button => {
        if (button.getAttribute('onclick') === `selectTimeRange('${savedTimeRange}')`) {
            button.classList.add('active', 'bg-blue-600', 'text-white');
            button.classList.remove('bg-blue-100', 'text-blue-800');
        }
    });
  }

  startApp();


  const intervalSyncTimer = null

  // Sync interval from server on page load
  async function syncIntervalFromServer() {
    try {
      const response = await fetch("/get-interval")
      if (response.ok) {
        const data = await response.json()
        currentInterval = data.secTimeInterval
        console.log(`[SYNC] Interval synced from server: ${currentInterval}s`)

        // Update UI if interval input exists
        const intervalInput = document.getElementById("secTimeInterval")
        if (intervalInput) {
          intervalInput.value = currentInterval
        }

        // Update all chart intervals
        updateAllChartIntervals()
        return true
      } else {
        console.warn("[SYNC] Failed to sync interval from server, using default")
        return false
      }
    } catch (error) {
      console.error("[SYNC] Error syncing interval from server:", error)
      return false
    }
  }

  // Update all chart update intervals
  function updateAllChartIntervals() {
    console.log(`[UPDATE] Updating all chart intervals to ${currentInterval}s`)

    // Clear existing intervals
    if (window.basicChartInterval) {
      clearInterval(window.basicChartInterval)
    }
    if (window.engineChartInterval) {
      clearInterval(window.engineChartInterval)
    }
    if (window.powermeterChartInterval) {
      clearInterval(window.powermeterChartInterval)
    }
    if (window.stackedChartInterval) {
      clearInterval(window.stackedChartInterval)
    }
    if (window.displayUpdateInterval) {
      clearInterval(window.displayUpdateInterval)
    }

    // Set new intervals based on current page
    const currentPage = window.location.pathname

    if (currentPage === "/" || currentPage === "/index.html") {
      // Basic sensor charts
      if (typeof updateChart === "function") {
        window.basicChartInterval = setInterval(updateChart, currentInterval * 1000)
        console.log(`[UPDATE] Basic chart interval set to ${currentInterval}s`)
      }
    }
  }

  // Set interval function with proper synchronization
  async function setDataCollectionInterval() {
    const intervalInput = document.getElementById("secTimeInterval")
    if (!intervalInput) {
      console.error("[SET] Interval input not found")
      return
    }

    const newInterval = Number.parseInt(intervalInput.value)

    if (isNaN(newInterval) || newInterval < 1 || newInterval > 3600) {
      alert("Please enter a valid interval between 1 and 3600 seconds.")
      intervalInput.value = currentInterval // Reset to current value
      return
    }

    try {
      console.log(`[SET] Setting interval to ${newInterval}s`)

      const response = await fetch("/set-interval", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ interval: newInterval }),
      })

      if (response.ok) {
        const data = await response.json()
        if (data.status === "success") {
          currentInterval = data.secTimeInterval
          console.log(`[SET] Interval successfully updated to ${currentInterval}s`)

          // Update all chart intervals immediately
          updateAllChartIntervals()

          // Show success message
          showNotification(`Data collection interval updated to ${currentInterval} seconds`, "success")

          // Broadcast change to other tabs/windows
          localStorage.setItem("intervalChanged", Date.now().toString())
          window.dispatchEvent(
            new CustomEvent("intervalChanged", {
              detail: { interval: currentInterval },
            }),
          )
        } else {
          throw new Error(data.message || "Failed to update interval")
        }
      } else {
        throw new Error(`Server error: ${response.status}`)
      }
    } catch (error) {
      console.error("[SET] Error setting interval:", error)
      showNotification(`Failed to update interval: ${error.message}`, "error")
      intervalInput.value = currentInterval // Reset to current value
    }
  }

  // Listen for interval changes from other tabs
  window.addEventListener("storage", (event) => {
    if (event.key === "intervalChanged") {
      console.log("[SYNC] Interval change detected from another tab")
      syncIntervalFromServer()
    }
  })

  // Sync interval on page load
  syncIntervalFromServer()

  // Make functions globally available
  window.setDataCollectionInterval = setDataCollectionInterval
  window.syncIntervalFromServer = syncIntervalFromServer

  // Periodic sync every 30 seconds to ensure consistency
  setInterval(() => {
    syncIntervalFromServer()
  }, 30000)

  // Load sensor calibrations on page load
  loadSensorCalibrations()

  // Make functions globally accessible
  window.selectTimeRange = selectTimeRange;
  window.downloadChartAsPDF = downloadChartAsPDF;
  window.switchSensor = switchSensor;
  window.syncCharts = syncCharts;
  window.updateCombinedChart = updateCombinedChart
  window.updateChart = updateCharts
  window.updateEngineChart = updateEngineCharts
  window.updatePowermeterChart = updatePowermeterCharts
  window.updateDisplays = () => {
    loadPowermeterDisplay()
    loadEngineDisplay()
  }
  window.showMessage = showNotification



})
