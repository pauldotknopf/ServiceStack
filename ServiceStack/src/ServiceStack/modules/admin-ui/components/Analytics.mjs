import {computed, inject, onMounted, onUnmounted, ref, watch} from "vue"
import {useClient, useFiles, useFormatters, css} from "@servicestack/vue";
import {ApiResult, apiValueFmt, humanify, mapGet,leftPart,pick} from "@servicestack/client"
import {GetAnalyticsReports} from "dtos"
import {Chart, registerables} from 'chart.js'
Chart.register(...registerables)
const { humanifyMs, humanifyNumber } = useFormatters()
export const colors = [
    { background: 'rgba(54, 162, 235, 0.2)',  border: 'rgb(54, 162, 235)' }, //blue
    { background: 'rgba(255, 99, 132, 0.2)',  border: 'rgb(255, 99, 132)' },
    { background: 'rgba(153, 102, 255, 0.2)', border: 'rgb(153, 102, 255)' },
    { background: 'rgba(54, 162, 235, 0.2)',  border: 'rgb(54, 162, 235)' },
    { background: 'rgba(255, 159, 64, 0.2)',  border: 'rgb(255, 159, 64)' },
    { background: 'rgba(67, 56, 202, 0.2)',   border: 'rgb(67, 56, 202)' },
    { background: 'rgba(255, 99, 132, 0.2)',  border: 'rgb(255, 99, 132)' },
    { background: 'rgba(14, 116, 144, 0.2)',  border: 'rgb(14, 116, 144)' },
    { background: 'rgba(162, 28, 175, 0.2)',  border: 'rgb(162, 28, 175)' },
    { background: 'rgba(201, 203, 207, 0.2)', border: 'rgb(201, 203, 207)' },
]
function httpStatusColor(status) {
    const code = parseInt(status)
    if (code < 300) return 'rgba(75, 192, 192, 0.2)'  // 2xx - success - green
    if (code < 400) return 'rgba(54, 162, 235, 0.2)'  // 3xx - redirect - blue
    if (code < 500) return 'rgba(255, 159, 64, 0.2)'  // 4xx - client error - orange
    return 'rgba(255, 99, 132, 0.2)'                  // 5xx - server error - red
}
function httpStatusGroup(status) {
    const code = parseInt(status)
    if (code < 300) return '200'
    if (code < 400) return '300'
    if (code < 500) return '400'
    return '500'
}
const ApiAnalytics = {
    template:`
      <div class="my-4 mx-auto max-w-lg">
        <Autocomplete ref="cboApis" id="op" label="" placeholder="Select API"
                      :match="(x, value) => x.key.toLowerCase().includes(value.toLowerCase())"
                      v-model="opEntry" :options="opEntries">
          <template #item="{ key, value }">
            <div v-if="value" class="truncate flex justify-between mr-8">
              <span>{{ key }}</span>
              <span class="text-gray-500">({{ humanifyNumber(value.totalRequests) }})</span>
            </div>
          </template>
        </Autocomplete>
      </div>
      <div v-if="routes.op && apiAnalytics" class="mb-8 pb-8 relative border-b">
        <CloseButton @click="routes.to({ op: undefined })" title="Close API" />
        <div class="flex">
          <div class="w-1/2">
            <div class="bg-white rounded shadow p-4" style="height:300px">
              <canvas ref="refStatusCodes"></canvas>
            </div>
          </div>
          <div class="w-1/2">
            <HtmlFormat :value="apiAnalytics" />
            <div class="ml-4">
              <nav class="-mb-px flex space-x-8">
                <a v-href="{ $page:'logging', op:routes.op, month:routes.month }" :title="routes.op + ' Request Logs'"
                   class="group flex whitespace-nowrap px-1 py-4 text-sm font-medium text-gray-500 hover:text-indigo-600">
                  <svg class=" text-gray-400 group-hover:text-indigo-500 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13c0 1-.6 3-3 3m0 0H6c-1 0-3-.6-3-3v-2h12v2c0 2.4 2 3 3 3zM9 7h8m-8 4h4"></path>
                  </svg>
                  <span>All</span>
                </a>
                <a v-for="link in apiLinks" :href="link.href" :title="link.label + ' Request Logs'"
                   class="group flex whitespace-nowrap px-1 py-4 text-sm font-medium text-gray-500 hover:text-indigo-600">
                  {{link.label}}
                  <span class="ml-2 hidden rounded-full bg-gray-100 group-hover:bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-gray-900 hover:text-indigo-600 md:inline-block">{{link.count}}</span>
                </a>
              </nav>
            </div>
          </div>
        </div>
      </div>
      <div :class="{ hidden:!!routes.op }">
        <div class="mb-2 flex justify-between">
          <div>
            Overview
          </div>
        </div>
        <div class="flex w-full gap-x-2">
          <div class="w-1/3 bg-white rounded shadow p-4 mb-8" style="height:300px">
            <canvas ref="refBrowsers"></canvas>
          </div>
          <div class="w-1/3 bg-white rounded shadow p-4 mb-8" style="height:300px">
            <canvas ref="refDevices"></canvas>
          </div>
          <div class="w-1/3 bg-white rounded shadow p-4 mb-8" style="height:300px">
            <canvas ref="refBots"></canvas>
          </div>
        </div>
        <div class="flex w-full gap-x-2">
          <div class="w-1/2">
            <div class="mb-2">
              Requests per day
            </div>
            <div class="bg-white rounded shadow p-4 mb-8" style="height:300px">
              <canvas ref="refWeeklyRequests"></canvas>
            </div>
          </div>
          <div class="w-1/2">
            <div class="mb-2">
              API tag groups
            </div>
            <div class="bg-white rounded shadow p-4 mb-8" style="height:300px">
              <canvas ref="refTags"></canvas>
            </div>
          </div>
        </div>
      </div>
      <div>
        <div class="mb-1 flex justify-between">
          <div>
            API Requests
          </div>
          <div>
            <SelectInput id="apiLimit" label="" v-model="limits.api" :values="resultLimits" />
          </div>
        </div>
        <div class="bg-white rounded shadow p-4 mb-8" :style="{height:chartHeight(Math.min(Object.keys(analytics?.apis ?? {}).length, limits.api)) + 'px'}">
          <canvas ref="refApiRequests"></canvas>
        </div>
      </div>
      <div>
        <div class="mb-1 flex justify-between">
          <div>
            API Duration
          </div>
          <div>
            <SelectInput id="apiLimit" label="" v-model="limits.duration" :values="resultLimits" />
          </div>
        </div>
        <div class="bg-white rounded shadow p-4 mb-8" :style="{height:chartHeight(Math.min(Object.keys(analytics?.apis ?? {}).length, limits.duration)) + 'px'}">
          <canvas ref="refApiDurations"></canvas>
        </div>
      </div>
    `,
    props: {
        analytics: Object,
    },
    setup(props) {
        const routes = inject('routes')
        const refBrowsers = ref(null)
        const refDevices = ref(null)
        const refBots = ref(null)
        const refWeeklyRequests = ref(null)
        const refTags = ref(null)
        const refApiRequests = ref(null)
        const refApiDurations = ref(null)
        const refStatusCodes = ref(null)
        const opEntry = ref()
        const opEntries = ref([])
        const resultLimits = [5,10,25,50,100]
        const limits = ref({
            api: 10,
            duration: 5
        })
        function chartHeight(recordCount, minHeight = 150, heightPerRecord = 22) {
            // Validate input
            const count = Math.min(Math.max(1, recordCount), 100);
            // Base height plus additional height per record
            // More records need more vertical space for readability
            return minHeight + (count * heightPerRecord);
        }
        const { formatBytes } = useFiles()
        const apiAnalytics = computed(() => {
            const api = props.analytics?.apis?.[routes.op]
            if (api) {
                const ret = {
                    totalRequests: humanifyNumber(api.totalRequests),
                    totalDuration: humanifyMs(api.totalDuration),
                    minDuration: humanifyMs(api.minDuration),
                    maxDuration: humanifyMs(api.maxDuration),
                }
                if (api.totalRequestLength) {
                    ret.totalRequestLength = formatBytes(api.totalRequestLength)
                    ret.minRequestLength = formatBytes(api.minRequestLength)
                    ret.maxRequestLength = formatBytes(api.maxRequestLength)
                }
                return ret
            }
            return null
        })
        const apiLinks = computed(() => {
            const api = props.analytics?.apis?.[routes.op]
            if (api) {
                let linkBase = `./logging?op=${routes.op}`
                if (routes.month) {
                    linkBase += `&month=${routes.month}`
                }
                const ret = []
                Object.entries(api.status).forEach(([status, count]) => {
                    ret.push({ label:status, href:`${linkBase}&status=${status}`, count })
                })
                return ret
            }
            return []
        })
        function apiOnClick(e, elements, chart) {
            console.log('onClick', e)
            const points = chart.getElementsAtEventForMode(e, 'nearest', { intersect: true }, false);
            if (points.length) {
                const firstPoint = points[0];
                const apiName = chart.data.labels[firstPoint.index];
                const apiStats = props.analytics.apis[apiName];
                // Do something with the clicked API data
                // For example, emit an event:
                // emit('apiSelected', { name: apiName, stats: apiStats });
                console.log('API clicked:', apiName, apiStats);
                routes.to({ op: apiName })
                // You could also implement a drill-down view or show details panel
            }
        }
        let statusCodesChart = null
        const createStatusCodesChart = () => {
            const api = props.analytics?.apis?.[routes.op]
            if (!routes.op || !api || !refStatusCodes.value) return
            // Group requests by status code
            const statusCounts = {}
            // Process each API entry to count status codes
            Object.entries(api.status).forEach(([status, count]) => {
                statusCounts[status] = (statusCounts[status] || 0) + count
            })
            // Create labels and data for the chart
            const labels = Object.keys(statusCounts)
            const data = Object.values(statusCounts)
            
            // Generate colors based on status code ranges
            const backgroundColor = labels.map(httpStatusColor)
            // Destroy existing chart if it exists
            if (statusCodesChart) {
                statusCodesChart.destroy()
            }
            statusCodesChart = new Chart(refStatusCodes.value, {
                type: 'pie',
                data: {
                    labels,
                    datasets: [{
                        data,
                        backgroundColor,
                        borderColor: backgroundColor.map(color => color.replace('0.2', '1')),
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'right',
                            title: {
                                display: true,
                                text: 'HTTP Status',
                                font: {
                                    weight: 'bold'
                                }
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const label = context.label || '';
                                    const value = context.raw || 0;
                                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                    const percentage = Math.round((value / total) * 100);
                                    return `${label}: ${value} (${percentage}%)`;
                                }
                            }
                        }
                    }
                }
            })
        }
        let browsersChart = null
        const createBrowsersChart = () => {
            if (!props.analytics || !refBrowsers.value) return
            const browsers = props.analytics.browsers || {}
            // Create labels and data for the chart
            const labels = Object.keys(browsers)
            const data = Object.values(browsers).map(b => b.totalRequests)
            // Ensure enough colors by cycling through the array
            const backgroundColor = labels.map((_, i) => colors[i % colors.length].background)
            const borderColor = labels.map((_, i) => colors[i % colors.length].border)
            // Destroy existing chart if it exists
            if (browsersChart) {
                browsersChart.destroy()
            }
            browsersChart = new Chart(refBrowsers.value, {
                type: 'pie',
                data: {
                    labels,
                    datasets: [{
                        data,
                        backgroundColor,
                        borderColor,
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'right',
                            title: {
                                display: true,
                                text: 'Browsers',
                                font: {
                                    weight: 'bold'
                                }
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const label = context.label || '';
                                    const value = context.raw || 0;
                                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                    const percentage = Math.round((value / total) * 100);
                                    return `${label}: ${value} (${percentage}%)`;
                                }
                            }
                        }
                    }
                }
            })
        }
        let devicesChart = null
        const createDevicesChart = () => {
            if (!props.analytics || !refDevices.value) return
            const devices = props.analytics.devices || {}
            // Create labels and data for the chart
            const labels = Object.keys(devices)
            const data = Object.values(devices).map(b => b.totalRequests)
            // Ensure enough colors by cycling through the array
            const backgroundColor = labels.map((_, i) => colors[i % colors.length].background)
            const borderColor = labels.map((_, i) => colors[i % colors.length].border)
            // Destroy existing chart if it exists
            if (devicesChart) {
                devicesChart.destroy()
            }
            devicesChart = new Chart(refDevices.value, {
                type: 'pie',
                data: {
                    labels,
                    datasets: [{
                        data,
                        backgroundColor,
                        borderColor,
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'right',
                            title: {
                                display: true,
                                text: 'Devices',
                                font: {
                                    weight: 'bold'
                                }
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const label = context.label || '';
                                    const value = context.raw || 0;
                                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                    const percentage = Math.round((value / total) * 100);
                                    return `${label}: ${value} (${percentage}%)`;
                                }
                            }
                        }
                    }
                }
            })
        }
        let botsChart = null
        const createBotsChart = () => {
            if (!props.analytics || !refBots.value) return
            let bots = props.analytics.bots || {}
            if (!Object.keys(bots).length) {
                bots = { None: 0 }
            }
            // Create labels and data for the chart
            const sortedBots = Object.entries(bots)
                .sort((a, b) => b[1].totalRequests - a[1].totalRequests)
                .slice(0, 11) // Limit to top 11 for better visualization
            const labels = sortedBots.map(x => x[0])
            const data = sortedBots.map(x => x[1].totalRequests)
            // Ensure enough colors by cycling through the array
            const backgroundColor = labels.map((_, i) => colors[i % colors.length].background)
            const borderColor = labels.map((_, i) => colors[i % colors.length].border)
            // Destroy existing chart if it exists
            if (botsChart) {
                botsChart.destroy()
            }
            botsChart = new Chart(refBots.value, {
                type: 'pie',
                data: {
                    labels,
                    datasets: [{
                        data,
                        backgroundColor,
                        borderColor,
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'right',
                            title: {
                                display: true,
                                text: 'Bots',
                                font: {
                                    weight: 'bold'
                                }
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const label = context.label || '';
                                    const value = context.raw || 0;
                                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                    const percentage = Math.round((value / total) * 100);
                                    return `${label}: ${value} (${percentage}%)`;
                                }
                            }
                        }
                    }
                }
            })
        }
        let weeklyRequestsChart = null;
        const createWeeklyRequestsChart = () => {
            if (!props.analytics || !refWeeklyRequests.value) return
            // Sample data provided
            const days = props.analytics.days
            
            const allDays = Object.keys(days)
            const last10Days = allDays.slice(Math.max(allDays.length - 10, 0))
            // Map numeric days to day names
            const labels = last10Days.map(day => new Date(routes.month
                ? `${routes.month}-${day.padStart(2, '0')}`
                : new Date().toISOString().slice(0, 7) + '-' + day.padStart(2, '0')).toLocaleDateString('en-US', { weekday: 'short' }) + ` ${day}`);
            // Extract request data
            const requestData = last10Days.map(day => days[day].totalRequests);
            // Calculate average response time data
            const avgResponseTimeData = last10Days.map(day =>
                Math.round(days[day].totalDuration / days[day].totalRequests)
            );
            // Destroy existing chart if it exists
            if (weeklyRequestsChart) {
                weeklyRequestsChart.destroy();
            }
            weeklyRequestsChart = new Chart(refWeeklyRequests.value, {
                type: 'line',
                data: {
                    labels,
                    datasets: [
                        {
                            label: 'Requests',
                            data: requestData,
                            borderColor: 'rgb(54, 162, 235)',
                            backgroundColor: 'rgba(54, 162, 235, 0.1)',
                            borderWidth: 2,
                            fill: true,
                            tension: 0.2,
                            yAxisID: 'y'
                        },
                        {
                            label: 'Avg Response Time (ms)',
                            data: avgResponseTimeData,
                            borderColor: 'rgb(255, 99, 132)',
                            backgroundColor: 'rgba(255, 99, 132, 0.1)',
                            borderWidth: 2,
                            fill: true,
                            tension: 0.2,
                            yAxisID: 'y1'
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'top',
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const label = context.dataset.label || '';
                                    const value = context.raw || 0;
                                    return `${label}: ${value.toLocaleString()}`;
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            position: 'left',
                            title: {
                                display: true,
                                text: 'Number of Requests'
                            }
                        },
                        y1: {
                            beginAtZero: true,
                            position: 'right',
                            grid: {
                                drawOnChartArea: false
                            },
                            title: {
                                display: true,
                                text: 'Avg Response Time (ms)'
                            }
                        }
                    }
                }
            });
        };
        let tagsChart = null
        const createTagsChart = () => {
            if (!props.analytics || !refTags.value) return
            let tags = props.analytics.tags || {}
            if (!Object.keys(tags).length) {
                tags = { None: 0 }
            }
            // Create labels and data for the chart
            const sortedTags = Object.entries(tags)
                .sort((a, b) => b[1].totalRequests - a[1].totalRequests)
                .slice(0, 11) // Limit to top 11 for better visualization
            const labels = sortedTags.map(x => x[0])
            const data = sortedTags.map(x => x[1].totalRequests)
            // Ensure enough colors by cycling through the array
            const backgroundColor = labels.map((_, i) => colors[i % colors.length].background)
            const borderColor = labels.map((_, i) => colors[i % colors.length].border)
            // Destroy existing chart if it exists
            if (tagsChart) {
                tagsChart.destroy()
            }
            tagsChart = new Chart(refTags.value, {
                type: 'pie',
                data: {
                    labels,
                    datasets: [{
                        data,
                        backgroundColor,
                        borderColor,
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'right',
                            title: {
                                display: true,
                                text: 'Tags',
                                font: {
                                    weight: 'bold'
                                }
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const label = context.label || '';
                                    const value = context.raw || 0;
                                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                    const percentage = Math.round((value / total) * 100);
                                    return `${label}: ${value} (${percentage}%)`;
                                }
                            }
                        }
                    }
                }
            })
        }
        
        let apiRequestsChart = null
        const createApiRequestsChart = () => {
            if (!props.analytics || !refApiRequests.value) return
            // Sort APIs by request count in descending order
            const sortedApis = Object.entries(props.analytics.apis)
                .sort((a, b) => b[1].totalRequests - a[1].totalRequests)
                .slice(0, limits.value.api) // Limit to top 15 for better visualization
            const labels = sortedApis.map(([api]) => api)
            const data = sortedApis.map(([_, stats]) => stats.totalRequests)
            const avgResponseTimes = sortedApis.map(([_, stats]) =>
                stats.totalRequests > 0 ? Math.round(stats.totalDuration / stats.totalRequests) : 0)
            // Destroy existing chart if it exists
            if (apiRequestsChart) {
                apiRequestsChart.destroy()
            }
            const datasets = [
                {
                    label: 'Requests',
                    data,
                    backgroundColor: 'rgba(54, 162, 235, 0.2)',
                    borderColor: 'rgb(54, 162, 235)',
                    borderWidth: 1
                }
            ]
            datasets.length = 0
            const statuses = [200, 300, 400, 500]
            statuses.forEach(status => {
                datasets.push({
                    label: `${status}`,
                    data: sortedApis.map(x => {
                        const ret = {}
                        Object.keys(x[1].status).forEach((status) => {
                            const group = httpStatusGroup(status)
                            ret[group] = (ret[group] || 0) + x[1].status[status]
                        })
                        return ret[status]
                    }),
                    backgroundColor: httpStatusColor(status),
                    borderColor: httpStatusColor(status).replace('0.2','1'),
                    borderWidth: 1
                })
            })
            
            apiRequestsChart = new Chart(refApiRequests.value, {
                type: 'bar',
                data: {
                    labels,
                    datasets,
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    indexAxis: 'y',
                    plugins: {
                        legend: {
                            position: 'top'
                        },
                        tooltip: {
                            callbacks: {
                                afterLabel: function(context) {
                                    const index = context.dataIndex;
                                    return `Total ${data[index]} requests, Avg Response Time: ${avgResponseTimes[index]}ms`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            stacked: true,
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: 'Number of Requests'
                            }
                        },
                        y: {
                            stacked: true
                        }
                    },
                    onClick: apiOnClick
                }
            })
        }
        let apiDurationsChart = null
        const createApiDurationsChart = () => {
            if (!props.analytics || !refApiDurations.value) return
            // Sort APIs by request count in descending order
            const sortedApis = Object.entries(props.analytics.apis)
                .sort((a, b) =>
                    Math.floor(b[1].totalDuration / b[1].totalRequests) - Math.floor(a[1].totalDuration / a[1].totalRequests))
                .slice(0, limits.value.duration) // Limit to top 15 for better visualization
            const labels = sortedApis.map(([api]) => api)
            const data = sortedApis.map(([_, stats]) => Math.floor(stats.totalDuration / stats.totalRequests))
            const avgRequestLengths = sortedApis.map(([_, stats]) =>
                stats.totalRequests > 0 ? Math.round(stats.requestLength / stats.totalRequests) : 0)
            // Destroy existing chart if it exists
            if (apiDurationsChart) {
                apiDurationsChart.destroy()
            }
            apiDurationsChart = new Chart(refApiDurations.value, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [
                        {
                            label: 'Average Duration (ms)',
                            data,
                            backgroundColor: 'rgba(54, 162, 235, 0.2)',
                            borderColor: 'rgb(54, 162, 235)',
                            borderWidth: 1
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    indexAxis: 'y',
                    plugins: {
                        legend: {
                            position: 'top',
                        },
                        tooltip: {
                            callbacks: {
                                afterLabel: function(context) {
                                    const index = context.dataIndex;
                                    return avgRequestLengths[index] > 0
                                        ? `Avg Request Body: ${avgRequestLengths[index]} bytes`
                                        : '';
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: 'Duration (ms)'
                            }
                        }
                    },
                    onClick: apiOnClick
                }
            })
        }
        
        onMounted(() => {
            update()
        })
        onUnmounted(() => {
            if (browsersChart) {
                browsersChart.destroy()
            }
            if (botsChart) {
                botsChart.destroy()
            }
            if (weeklyRequestsChart) {
                weeklyRequestsChart.destroy()
            }
            if (tagsChart) {
                tagsChart.destroy()
            }
            if (apiRequestsChart) {
                apiRequestsChart.destroy()
            }
            if (apiDurationsChart) {
                apiDurationsChart.destroy()
            }
            if (statusCodesChart) {
                statusCodesChart.destroy()
            }
        })
        
        function update() {
            opEntries.value = Object.keys(props.analytics?.apis ?? {})
                .map(key => ({ key, value:props.analytics.apis[key] }))
                .sort((a,b) => b.value.totalRequests - a.value.totalRequests)
            opEntry.value = routes.op ? opEntries.value.find(x => x.key === routes.op) : null
            createBrowsersChart()
            createDevicesChart()
            createBotsChart()
            createWeeklyRequestsChart()
            createTagsChart()
            createApiRequestsChart()
            createApiDurationsChart()
            createStatusCodesChart()
        }
        
        watch(() => [routes.month], update)
        watch(() => [routes.op], () => {
            opEntry.value = routes.op ? opEntries.value.find(x => x.key === routes.op) : null
            setTimeout(() => {
                createStatusCodesChart()
            }, 0)
        })
        watch(() => [opEntry.value], () => {
            const op = opEntry.value?.key
            if (op !== routes.op) {
                routes.to({ op })
            }
        })
        watch(() => [props.analytics, limits.value.api], () => {
            setTimeout(() => {
                createApiRequestsChart()
            }, 0)
        })
        watch(() => [props.analytics, limits.value.duration], () => {
            setTimeout(() => {
                createApiDurationsChart()
            }, 0)
        })
        watch(() => [props.analytics, routes.op], () => {
            setTimeout(() => {
                createStatusCodesChart()
            }, 0)
        })
        return {
            routes,
            limits,
            resultLimits,
            apiAnalytics,
            apiLinks,
            opEntry,
            opEntries,
            refBrowsers,
            refDevices,
            refBots,
            refWeeklyRequests,
            refTags,
            refApiRequests,
            refApiDurations,
            refStatusCodes,
            chartHeight,
            humanifyNumber,
        }
    }
}
export const Analytics = {
    components: {
        ApiAnalytics,
    },
    template: `
      <div class="container mx-auto">
        <div v-if="loading" class="flex justify-center p-12">
          <Loading v-if="loading">generating...</Loading>
        </div>
        <ErrorSummary v-else-if="api.error" :status="api.error" />
        <div v-else>
          <div>
            <div class="mb-2 flex flex-wrap justify-center">
              <template v-for="year in years">
                <b v-if="year === (routes.year || new Date().getFullYear().toString())" class="ml-3 text-sm font-semibold">
                  {{ year }}
                </b>
                <a v-else v-href="{ year }" class="ml-3 text-sm text-indigo-700 font-semibold hover:underline">
                  {{ year }}
                </a>
              </template>
            </div>
            <div class="flex flex-wrap justify-center">
              <template v-for="month in months.filter(x => x.startsWith(routes.year || new Date().getFullYear().toString()))">
               <span v-if="month === (routes.month || (new Date().getFullYear() + '-' + (new Date().getMonth() + 1).toString().padStart(2,'0')))" class="mr-2 mb-2 text-xs leading-5 font-semibold bg-indigo-600 text-white rounded-full py-1 px-3 flex items-center space-x-2">
               {{ new Date(month + '-01').toLocaleString('default', { month: 'long' }) }}
               </span>
                <a v-else v-href="{ month }" class="mr-2 mb-2 text-xs leading-5 font-semibold bg-slate-400/10 rounded-full py-1 px-3 flex items-center space-x-2 hover:bg-slate-400/20 dark:highlight-white/5">
                  {{ new Date(month + '-01').toLocaleString('default', { month: 'short' }) }}
                </a>
              </template>
            </div>
          </div>
          
          <div v-if="analytics">
            <ApiAnalytics :analytics="analytics" />
          </div>
          
        </div>
      </div>
    `,
    setup(props) {
        const routes = inject('routes')
        const client = useClient()
        const analytics = ref(null)
        const loading = ref(false)
        const error = ref(null)
        const api = ref(new ApiResult())
        const months = ref([])
        const years = computed(() => 
            Array.from(new Set(months.value.map(x => leftPart(x,'-')))).toReversed())
        
        async function update() {
            loading.value = true
            //await delay(2000); // Pauses for 2 seconds
            api.value = await client.api(new GetAnalyticsReports({
                month: routes.month ? `${routes.month}-01` : undefined
            }))
            if (api.value.succeeded) {
                analytics.value = api.value.response.results
                months.value = api.value.response.months
                loading.value = false
            }
            loading.value = false
        }
        
        onMounted(async () => {
            await update()
        })
        watch(() => [routes.month], () => {
            setTimeout(() => {
                update()
            }, 0)
        })
        return {
            routes,
            api,
            analytics,
            loading,
            error,
            months,
            years,
        }
    }
}
