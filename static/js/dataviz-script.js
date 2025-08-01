
// Global variables
let uploadedData = null
let originalData = null
let filteredData = null
let charts = {}
const currentSettings = {
  timeRange: "1h",
  interval: 30,
  chartType: "line",
  showTrend: false,
  showAverage: false,
}
let sensorCalibrations = {} // To store sensor names and units

// Chart colors
const CHART_COLORS = [
  "rgb(59, 130, 246)", // blue
  "rgb(34, 197, 94)", // green
  "rgb(168, 85, 247)", // purple
  "rgb(239, 68, 68)", // red
  "rgb(236, 72, 153)", // pink
  "rgb(245, 158, 11)", // yellow
  "rgb(107, 114, 128)", // gray
]

// Time range configurations (in hours)
const TIME_RANGES = {
  "1h": 1,
  "2h": 2,
  "6h": 6,
  "12h": 12,
  "1d": 24,
  "3d": 72,
  "7d": 168,
  "30d": 720,
  all: null, // For all data
}

// Helper function for Simple Moving Average (SMA)
function simpleMovingAverage(data, windowSize) {
  if (!data || data.length < windowSize) return []
  const sma = []
  for (let i = 0; i < data.length; i++) {
    if (i < windowSize - 1) {
      const windowSlice = data.slice(0, i + 1)
      const avg = windowSlice.reduce((sum, val) => sum + val, 0) / windowSlice.length
      sma.push(avg)
    } else {
      const windowSlice = data.slice(i - windowSize + 1, i + 1)
      const avg = windowSlice.reduce((sum, val) => sum + val, 0) / windowSize
      sma.push(avg)
    }
  }
  return sma
}

// Function to load sensor calibrations
async function loadSensorCalibrations() {
  try {
    const response = await fetch("/load-sensors")
    const data = await response.json()
    sensorCalibrations = data
    console.log("Sensor calibrations loaded:", sensorCalibrations)
    return sensorCalibrations
  } catch (error) {
    console.error("Error loading sensor calibrations:", error)
    return {}
  }
}

// Function to get sensor display name with unit
function getSensorDisplayName(channelNum) {
  const channelKey = `sensor${channelNum}`
  const calibration = sensorCalibrations[channelKey]
  if (calibration) {
    const name = calibration.name || `CH${channelNum}`
    const unit = calibration.unit ? ` (${calibration.unit})` : ""
    return name + unit
  }
  return `CH${channelNum}`
}

// Initialize when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  console.log("Data Visualization page loaded")
  initializePage()
})

// Initialize page functionality
async function initializePage() {
  await loadSensorCalibrations() // Load calibrations first
  initializeSidebar()
  initializeFileUpload()
  initializeControls()
  updateCurrentRangeDisplay()
  updateCurrentIntervalDisplay()
}

// Sidebar functionality (copied from script.js)
function initializeSidebar() {
  const sidebarToggle = document.getElementById("sidebar-toggle")
  const sidebar = document.getElementById("sidebar")
  const sidebarOverlay = document.getElementById("sidebar-overlay")
  const sidebarClose = document.getElementById("sidebar-close")

  const sidebarState = localStorage.getItem("sidebarState")

  function openSidebar() {
    sidebar.classList.add("active")
    sidebarToggle.classList.add("active")
    sidebarOverlay.classList.remove("hidden")
    localStorage.setItem("sidebarState", "open")
  }

  function closeSidebar() {
    sidebar.classList.remove("active")
    sidebarToggle.classList.remove("active")
    sidebarOverlay.classList.add("hidden")
    localStorage.setItem("sidebarState", "closed")
  }

  if (sidebarState === "open") {
    openSidebar()
  }

  sidebarToggle.addEventListener("click", () => {
    sidebar.classList.contains("active") ? closeSidebar() : openSidebar()
  })

  sidebarClose.addEventListener("click", closeSidebar)
  sidebarOverlay.addEventListener("click", closeSidebar)

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && sidebar.classList.contains("active")) {
      closeSidebar()
    }
  })

  function handleResponsiveLayout() {
    if (window.innerWidth < 768 && sidebar.classList.contains("active")) {
      closeSidebar()
    }
  }

  window.addEventListener("resize", handleResponsiveLayout)

  const currentPath = window.location.pathname
  const navItems = document.querySelectorAll(".nav-item")

  navItems.forEach((item) => {
    const href = item.getAttribute("href")
    if (href === currentPath) {
      item.classList.add("active")
    } else {
      item.classList.remove("active")
    }
  })
}

// File upload functionality
function initializeFileUpload() {
  const uploadArea = document.getElementById("upload-area")
  const fileInput = document.getElementById("csv-file-input")
  const fileInfo = document.getElementById("file-info")
  const fileNameElement = document.getElementById("file-name")
  const fileSizeElement = document.getElementById("file-size")
  const removeFileBtn = document.getElementById("remove-file")
  const chooseFileBtn = uploadArea.querySelector("button")

  // Click to upload
  chooseFileBtn.addEventListener("click", (e) => {
    e.preventDefault() // Prevent form submission if button is inside a form
    fileInput.click()
  })

  // Drag and drop functionality
  uploadArea.addEventListener("dragover", (e) => {
    e.preventDefault()
    uploadArea.classList.add("dragover")
  })

  uploadArea.addEventListener("dragleave", (e) => {
    e.preventDefault()
    uploadArea.classList.remove("dragover")
  })

  uploadArea.addEventListener("drop", (e) => {
    e.preventDefault()
    uploadArea.classList.remove("dragover")

    const files = e.dataTransfer.files
    if (files.length > 0) {
      handleFileUpload(files[0])
    }
  })

  // File input change
  fileInput.addEventListener("change", (e) => {
    if (e.target.files.length > 0) {
      handleFileUpload(e.target.files[0])
    }
  })

  // Remove file
  removeFileBtn.addEventListener("click", () => {
    fileInput.value = ""
    fileInfo.classList.add("hidden")
    hideControlsAndCharts()
    uploadedData = null
    originalData = null
    filteredData = null
    // Destroy all charts
    Object.values(charts).forEach((chart) => chart.destroy())
    charts = {}
    updateDataStatistics() // Reset stats
  })
}

// Initialize controls
function initializeControls() {
  // Time range buttons
  document.querySelectorAll(".time-range-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".time-range-btn").forEach((b) => b.classList.remove("active"))
      btn.classList.add("active")
      currentSettings.timeRange = btn.dataset.range
      updateCurrentRangeDisplay()
    })
  })

  // Interval selection
  const intervalPreset = document.getElementById("interval-preset")
  const customInterval = document.getElementById("custom-interval")

  intervalPreset.addEventListener("change", () => {
    if (intervalPreset.value === "custom") {
      customInterval.style.display = "block"
      customInterval.focus()
    } else {
      customInterval.style.display = "none"
      currentSettings.interval = Number.parseInt(intervalPreset.value)
      updateCurrentIntervalDisplay()
    }
  })

  customInterval.addEventListener("input", () => {
    const value = Number.parseInt(customInterval.value)
    if (!isNaN(value) && value > 0) {
      currentSettings.interval = value
      updateCurrentIntervalDisplay()
    }
  })

  // Chart type buttons
  document.getElementById("chart-type-line").addEventListener("click", () => {
    setChartType("line")
  })

  document.getElementById("chart-type-area").addEventListener("click", () => {
    setChartType("area")
  })

  document.getElementById("chart-type-points").addEventListener("click", () => {
    setChartType("points")
  })

  // Trend and average buttons
  document.getElementById("show-trend").addEventListener("click", () => {
    currentSettings.showTrend = !currentSettings.showTrend
    document.getElementById("show-trend").classList.toggle("active")
  })

  document.getElementById("show-average").addEventListener("click", () => {
    currentSettings.showAverage = !currentSettings.showAverage
    document.getElementById("show-average").classList.toggle("active")
  })

  // Export buttons
  document.getElementById("export-png").addEventListener("click", exportChartsPNG)
  document.getElementById("export-csv").addEventListener("click", exportFilteredCSV)

  // Apply filters button
  document.getElementById("apply-filters").addEventListener("click", applyFiltersAndUpdate)
}

// Handle file upload
function handleFileUpload(file) {
  if (!file.name.toLowerCase().endsWith(".csv")) {
    showNotification("Please select a CSV file.", "error")
    return
  }

  const fileNameElement = document.getElementById("file-name")
  const fileSizeElement = document.getElementById("file-size")

  // Show file info
  fileNameElement.textContent = file.name
  fileSizeElement.textContent = `(${formatFileSize(file.size)})`
  document.getElementById("file-info").classList.remove("hidden")

  // Show loading
  showLoading()

  // Upload file
  const formData = new FormData()
  formData.append("csvFile", file)

  showNotification("Uploading and processing CSV file...", "info")

  fetch("/upload-csv", {
    method: "POST",
    body: formData,
  })
    .then((response) => response.json())
    .then((data) => {
      hideLoading()
      if (data.status === "success") {
        showNotification(data.message, "success")
        originalData = data.data
        uploadedData = data.data

        // Show controls and initialize charts
        showControlsAndCharts()
        initializeDataVisualization()
      } else {
        showNotification(data.message, "error")
      }
    })
    .catch((error) => {
      hideLoading()
      console.error("Upload error:", error)
      showNotification("Error uploading file: " + error.message, "error")
    })
}

// Show controls and charts sections
function showControlsAndCharts() {
  document.getElementById("controls-section").classList.remove("hidden")
  document.getElementById("charts-section").classList.remove("hidden")
}

// Hide controls and charts sections
function hideControlsAndCharts() {
  document.getElementById("controls-section").classList.add("hidden")
  document.getElementById("charts-section").classList.add("hidden")
}

// Initialize data visualization
function initializeDataVisualization() {
  updateDataStatistics()
  applyFiltersAndUpdate()
}

// Apply filters and update charts
function applyFiltersAndUpdate() {
  if (!originalData) {
    showNotification("Please upload a CSV file first.", "warning")
    return
  }

  showLoading()

  // Filter data based on time range
  filteredData = filterDataByTimeRange(originalData, currentSettings.timeRange)

  // Apply interval sampling
  filteredData = sampleDataByInterval(filteredData, currentSettings.interval)

  // Update statistics
  updateDataStatistics()

  // Create/update charts
  createCharts(filteredData)

  hideLoading()
  showNotification("Charts updated successfully!", "success")
}

// Filter data by time range
function filterDataByTimeRange(data, timeRange) {
  if (timeRange === "all" || !data || data.length === 0) {
    return data
  }

  // Sort data by date/time (newest first)
  const sortedData = [...data].sort((a, b) => {
    const dateA = new Date(`${a.date} ${a.time}`)
    const dateB = new Date(`${b.date} ${b.time}`)
    return dateB - dateA
  })

  if (sortedData.length === 0) return []

  // Get the latest timestamp
  const latestTime = new Date(`${sortedData[0].date} ${sortedData[0].time}`)
  const hoursBack = TIME_RANGES[timeRange]
  const cutoffTime = new Date(latestTime.getTime() - hoursBack * 60 * 60 * 1000)

  // Filter data within time range
  return sortedData.filter((row) => {
    const rowTime = new Date(`${row.date} ${row.time}`)
    return rowTime >= cutoffTime
  })
}

// Sample data by interval
function sampleDataByInterval(data, intervalSeconds) {
  if (!data || data.length === 0 || intervalSeconds <= 0) {
    return data
  }

  // Sort data chronologically (oldest first)
  const sortedData = [...data].sort((a, b) => {
    const dateA = new Date(`${a.date} ${a.time}`)
    const dateB = new Date(`${b.date} ${b.time}`)
    return dateA - dateB
  })

  if (sortedData.length <= 1) return sortedData

  const sampledData = [sortedData[0]] // Always include first point
  let lastSampledTime = new Date(`${sortedData[0].date} ${sortedData[0].time}`)

  for (let i = 1; i < sortedData.length; i++) {
    const currentTime = new Date(`${sortedData[i].date} ${sortedData[i].time}`)
    const timeDiff = (currentTime - lastSampledTime) / 1000 // Convert to seconds

    if (timeDiff >= intervalSeconds) {
      sampledData.push(sortedData[i])
      lastSampledTime = currentTime
    }
  }

  // Always include last point if it's not already included
  const lastPoint = sortedData[sortedData.length - 1]
  if (sampledData[sampledData.length - 1].id !== lastPoint.id) {
    sampledData.push(lastPoint)
  }

  return sampledData
}

// Update data statistics
function updateDataStatistics() {
  const totalRecords = originalData ? originalData.length : 0
  const filteredRecords = filteredData ? filteredData.length : 0

  document.getElementById("total-records").textContent = totalRecords
  document.getElementById("filtered-records").textContent = filteredRecords
  document.getElementById("record-count").textContent = filteredRecords

  // Calculate time span
  if (filteredData && filteredData.length > 1) {
    const sortedData = [...filteredData].sort((a, b) => {
      const dateA = new Date(`${a.date} ${a.time}`)
      const dateB = new Date(`${b.date} ${b.time}`)
      return dateA - dateB
    })

    const startTime = new Date(`${sortedData[0].date} ${sortedData[0].time}`)
    const endTime = new Date(`${sortedData[sortedData.length - 1].date} ${sortedData[sortedData.length - 1].time}`)
    const timeDiff = endTime - startTime

    const hours = Math.floor(timeDiff / (1000 * 60 * 60))
    const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60))

    document.getElementById("time-span").textContent = `${hours}h ${minutes}m`
  } else {
    document.getElementById("time-span").textContent = "-"
  }
}

// Create charts
function createCharts(data) {
  if (!data || data.length === 0) {
    showNotification("No data available for the selected time range and interval.", "error")
    // Destroy all existing charts if no data
    Object.values(charts).forEach((chart) => chart.destroy())
    charts = {}
    return
  }

  // Process data for charts
  const processedData = data.map((row) => ({
    x: `${row.date} ${row.time}`,
    timestamp: new Date(`${row.date} ${row.time}`),
    ch1: row.ch1 || 0,
    ch2: row.ch2 || 0,
    ch3: row.ch3 || 0,
    ch4: row.ch4 || 0,
    ch5: row.ch5 || 0,
    ch6: row.ch6 || 0,
    ch7: row.ch7 || 0,
  }))

  // Sort by timestamp
  processedData.sort((a, b) => a.timestamp - b.timestamp)

  // Create chart for each channel
  for (let i = 1; i <= 7; i++) {
    createChannelChart(i, processedData)
  }
}

// Create individual channel chart
function createChannelChart(channelNum, data) {
  const ctx = document.getElementById(`ch${channelNum}-viz-chart`)
  if (!ctx) return

  const channelData = data.map((row) => ({
    x: row.timestamp,
    y: row[`ch${channelNum}`],
  }))

  // Calculate statistics
  const values = channelData.map((d) => d.y)
  const min = values.length > 0 ? Math.min(...values) : 0
  const max = values.length > 0 ? Math.max(...values) : 0
  const avg = values.length > 0 ? values.reduce((sum, val) => sum + val, 0) / values.length : 0

  // Update statistics display
  document.getElementById(`ch${channelNum}-stats`).textContent =
    `Min: ${min.toFixed(2)} | Max: ${max.toFixed(2)} | Avg: ${avg.toFixed(2)}`

  // Destroy existing chart if it exists
  if (charts[`ch${channelNum}`]) {
    charts[`ch${channelNum}`].destroy()
  }

  // Prepare datasets
  const datasets = [
    {
      label: getSensorDisplayName(channelNum),
      data: channelData,
      borderColor: CHART_COLORS[channelNum - 1],
      backgroundColor: currentSettings.chartType === "area" ? CHART_COLORS[channelNum - 1] + "20" : "transparent",
      borderWidth: 2,
      fill: currentSettings.chartType === "area",
      tension: currentSettings.chartType === "points" ? 0 : 0.4,
      pointRadius: currentSettings.chartType === "points" ? 3 : 1,
      pointHoverRadius: 5,
      showLine: currentSettings.chartType !== "points",
    },
  ]

  // Add trend line if enabled
  if (currentSettings.showTrend && values.length > 1) {
    const trendData = calculateTrendLine(channelData)
    datasets.push({
      label: `${getSensorDisplayName(channelNum)} Trend`,
      data: trendData,
      borderColor: CHART_COLORS[channelNum - 1] + "80",
      backgroundColor: "transparent",
      borderWidth: 2,
      borderDash: [5, 5],
      fill: false,
      pointRadius: 0,
      tension: 0,
    })
  }

  // Add average line if enabled
  if (currentSettings.showAverage) {
    datasets.push({
      label: `${getSensorDisplayName(channelNum)} Average`,
      data: channelData.map((d) => ({ x: d.x, y: avg })),
      borderColor: CHART_COLORS[channelNum - 1] + "60",
      backgroundColor: "transparent",
      borderWidth: 1,
      borderDash: [2, 2],
      fill: false,
      pointRadius: 0,
    })
  }

  // Create chart
  charts[`ch${channelNum}`] = new Chart(ctx, {
    type: "line",
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        intersect: false,
        mode: "index",
      },
      plugins: {
        legend: {
          display: currentSettings.showTrend || currentSettings.showAverage,
          position: "top",
          labels: {
            usePointStyle: true,
            padding: 10,
            font: { size: 10 },
          },
        },
        tooltip: {
          backgroundColor: "rgba(0, 0, 0, 0.8)",
          titleColor: "white",
          bodyColor: "white",
          borderColor: CHART_COLORS[channelNum - 1],
          borderWidth: 1,
          callbacks: {
            title: (context) => {
              return new Date(context[0].parsed.x).toLocaleString()
            },
            label: (context) => {
              return `${context.dataset.label}: ${context.parsed.y.toFixed(4)}`
            },
          },
        },
      },
      scales: {
        x: {
          type: "time",
          time: {
            displayFormats: {
              minute: "HH:mm",
              hour: "HH:mm",
              day: "MM/DD",
            },
          },
          display: true,
          title: {
            display: true,
            text: "Time",
          },
          ticks: {
            maxTicksLimit: 8,
          },
        },
        y: {
          display: true,
          title: {
            display: true,
            text: "Value",
          },
          beginAtZero: false,
        },
      },
      elements: {
        point: {
          hoverBackgroundColor: CHART_COLORS[channelNum - 1],
        },
      },
    },
  })
}

// Calculate trend line using linear regression
function calculateTrendLine(data) {
  if (data.length < 2) return []

  const n = data.length
  let sumX = 0,
    sumY = 0,
    sumXY = 0,
    sumXX = 0

  data.forEach((point, index) => {
    sumX += index
    sumY += point.y
    sumXY += index * point.y
    sumXX += index * index
  })

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
  const intercept = (sumY - slope * sumX) / n

  return data.map((point, index) => ({
    x: point.x,
    y: slope * index + intercept,
  }))
}

// Set chart type
function setChartType(type) {
  currentSettings.chartType = type

  // Update button states
  document.querySelectorAll('[id^="chart-type-"]').forEach((btn) => {
    btn.classList.remove("active")
  })
  document.getElementById(`chart-type-${type}`).classList.add("active")

  // Re-render charts with new type
  applyFiltersAndUpdate()
}

// Update current range display
function updateCurrentRangeDisplay() {
  document.getElementById("current-range").textContent = currentSettings.timeRange.toUpperCase()
}

// Update current interval display
function updateCurrentIntervalDisplay() {
  document.getElementById("current-interval").textContent = `${currentSettings.interval}s`
}

// Export charts as PNG
function exportChartsPNG() {
  if (!filteredData || filteredData.length === 0) {
    showNotification("No data to export.", "warning")
    return
  }

  showLoading()
  showNotification("Preparing charts for export...", "info")

  // Dynamically import JSZip
  import("https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js")
    .then((JSZipModule) => {
      const JSZip = JSZipModule.default
      const zip = new JSZip()
      const promises = []

      for (let i = 1; i <= 7; i++) {
        const chart = charts[`ch${i}`]
        if (chart) {
          const canvas = chart.canvas
          // Use a promise to ensure all canvases are processed
          promises.push(
            new Promise((resolve) => {
              canvas.toBlob((blob) => {
                zip.file(`${getSensorDisplayName(i).replace(/[^a-zA-Z0-9]/g, "_")}_chart.png`, blob)
                resolve()
              }, "image/png")
            }),
          )
        }
      }

      Promise.all(promises)
        .then(() => {
          zip
            .generateAsync({ type: "blob" })
            .then((content) => {
              const link = document.createElement("a")
              link.href = URL.createObjectURL(content)
              link.download = `sensor_charts_${new Date().toISOString().slice(0, 10)}.zip`
              document.body.appendChild(link)
              link.click()
              document.body.removeChild(link)
              hideLoading()
              showNotification("Charts exported as PNG files!", "success")
            })
            .catch((error) => {
              console.error("Error generating zip:", error)
              hideLoading()
              showNotification("Failed to export charts as PNG. Try again.", "error")
            })
        })
        .catch((error) => {
          console.error("Error processing canvases:", error)
          hideLoading()
          showNotification("Failed to export charts as PNG. Try again.", "error")
        })
    })
    .catch((error) => {
      console.error("Failed to load JSZip:", error)
      hideLoading()
      showNotification("Failed to load necessary export libraries. Check internet connection.", "error")
    })
}

// Export filtered data as CSV
function exportFilteredCSV() {
  if (!filteredData || filteredData.length === 0) {
    showNotification("No data to export", "warning")
    return
  }

  // Create CSV content
  const headers = ["ID", "Date", "Time"]
  for (let i = 1; i <= 7; i++) {
    headers.push(getSensorDisplayName(i))
  }

  const csvContent = [
    headers.join(","),
    ...filteredData.map((row) => {
      const rowValues = [row.id, row.date, row.time]
      for (let i = 1; i <= 7; i++) {
        rowValues.push(row[`ch${i}`] || 0)
      }
      return rowValues.join(",")
    }),
  ].join("\n")

  // Download CSV
  const blob = new Blob([csvContent], { type: "text/csv" })
  const link = document.createElement("a")
  link.href = URL.createObjectURL(blob)
  link.download = `filtered_sensor_data_${new Date().toISOString().slice(0, 10)}.csv`
  link.click()

  showNotification("Filtered data exported as CSV!", "success")
}

// Utility functions
function formatFileSize(bytes) {
  if (bytes === 0) return "0 Bytes"
  const k = 1024
  const sizes = ["Bytes", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
}

function showNotification(message, type = "info") {
  const notification = document.getElementById("notification")
  if (!notification) return // Ensure notification element exists

  notification.className = `notification ${type}`
  notification.textContent = message
  notification.classList.remove("hidden")

  setTimeout(() => {
    notification.classList.add("hidden")
  }, 5000)
}

function showLoading() {
  document.getElementById("loading-overlay").classList.remove("hidden")
}

function hideLoading() {
  document.getElementById("loading-overlay").classList.add("hidden")
}
