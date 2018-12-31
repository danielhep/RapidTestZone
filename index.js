const mongoose = require('mongoose')
const { DateTime, Interval } = require('luxon')
const _ = require('lodash')
require('colors') // changes string prototype
const { table } = require('table')

const { findMedian } = require('./support')

const Trips = require('gtfs/models/gtfs/trip')
const StopTimes = require('gtfs/models/gtfs/stop-time')
const Routes = require('gtfs/models/gtfs/route')
const Stops = require('gtfs/models/gtfs/stop')
const Calendars = require('gtfs/models/gtfs/calendar')
const CalendarDates = require('gtfs/models/gtfs/calendar-date')

const log = console.log

const mongoURI = 'mongodb://localhost:27017/gtfs'
const agencyKey = 'whatcom-transit-authority'
// const routeNames = []
const routeNames = ['190', '14']
// const routeNames = ['80S', '190S', '190', '14', '108', '11', '108S', '14S', '107']
const stopCode = 2083
const frequentService = 15
const searchDate = DateTime.local(2019, 1, 9)
// const searchDate = DateTime.local()
mongoose.connect(mongoURI, { useNewUrlParser: true })
var db = mongoose.connection
db.on('error', console.error.bind(console, 'connection error:'))
db.once('open', async function () {
  // get today's date, service codes for today's date
  let dayName = searchDate.toFormat('EEEE').toLowerCase()
  let calendars = await Calendars.find({ agency_key: agencyKey }).exec()
  let serviceIds = []
  calendars.forEach(item => {
    // also ensure that today is within the valid date range
    let startDate = DateTime.fromFormat(item.start_date.toString(), 'yyyyLLdd')
    let endDate = DateTime.fromFormat(item.end_date.toString(), 'yyyyLLdd')
    let interval = Interval.fromDateTimes(startDate, endDate)

    if (item[dayName] && interval.contains(searchDate)) {
      serviceIds.push(item.service_id)
    }
  })

  // add service IDs for calendar-dates
  let calendarDates = await CalendarDates.find({ agency_key: agencyKey }).exec()
  calendarDates.forEach(item => {
    let date = DateTime.fromFormat(item.date.toString(), 'yyyyLLdd')
    if (+date === +searchDate) {
      if (item.exception_type === 1) {
        serviceIds.push(item.service_id)
        log(item.service_id)
      } else if (item.exception_type === 2) {
        // log(item.service_id)
        _.pull(serviceIds, item.service_id)
      }
    }
  })

  // find bus stop ID from google maps ID
  let stops = await Stops.find({ stop_code: stopCode, agency_key: agencyKey }, 'stop_id').exec()
  let stopId = stops[0].stop_id

  // get a list of route ids from route names
  let query = routeNames.length ? { route_short_name: { $in: routeNames }, agency_key: agencyKey } : { agency_key: agencyKey }
  let routes = await Routes.find(query, 'route_id route_short_name').exec()
  let routeIds = _.map(routes, 'route_id')
  // get a list of trips for routes
  let trips
  if (!routeNames.length) {
    trips = await Trips.find(
      { service_id: { $in: serviceIds }, agency_key: agencyKey },
      'trip_id route_id service_id trip_headsign'
    ).exec()
  } else {
    trips = await Trips.find(
      { route_id: { $in: routeIds }, service_id: { $in: serviceIds }, agency_key: agencyKey },
      'trip_id route_id service_id trip_headsign'
    ).exec()
  }
  let tripIds = _.map(trips, 'trip_id')
  // times for the above trips at a specific stop
  let stopTimes = await StopTimes.find(
    // pickup type 0: picks up passengers
    { trip_id: { $in: tripIds }, stop_id: stopId, pickup_type: 0, agency_key: agencyKey },
    'trip_id departure_time'
  ).exec()
  // sort them so we can get the first item to prefille "last time"
  stopTimes = _.sortBy(stopTimes, s => DateTime.fromFormat(s.departure_time, 'H:mm:ss'))
  let lastTime = DateTime.fromFormat(stopTimes[0].departure_time, 'H:mm:ss')
  let departures = []
  let firstRun = true
  stopTimes.forEach(stopTime => {
    let trip = _.find(trips, { trip_id: stopTime.trip_id })
    let routeId = trip.route_id
    let route = _.find(routes, { route_id: routeId })
    let routeName = route.route_short_name
    let tripHeadsign = trip.trip_headsign
    let time = DateTime.fromFormat(stopTime.departure_time, 'H:mm:ss')
    let spacing = firstRun ? undefined : Interval.fromDateTimes(lastTime, time).length('minutes')
    firstRun = false
    lastTime = time
    departures.push({
      routeId,
      routeName,
      time,
      spacing,
      tripHeadsign
    })
  })

  lastTime = departures[0].time
  let routeStats = {}
  departures.forEach(item => {
    if (lastTime.hour !== item.time.hour) {
      log(`------- ${item.time.toFormat("h' 'a")} ------- `)
    }
    let timeSinceLast = Math.round(item.spacing) | 0
    let timeSinceLastString = timeSinceLast > frequentService ? String(timeSinceLast).red : String(timeSinceLast).green
    log(`Route ${item.routeName} ${item.tripHeadsign}`.yellow + ` departing at ${item.time.toLocaleString(DateTime.TIME_SIMPLE)} (${timeSinceLastString})`)
    lastTime = item.time
    _.set(routeStats, `${item.routeName}.cnt`, (_.get(routeStats, `${item.routeName}.cnt`) | 0) + 1)
  })

  // Statistics

  // get total count
  let totalCnt = _.reduce(routeStats, (sum, r) => sum + r.cnt, 0)

  let spacing = _.flatMap(departures, n => {
    return n.spacing
  })
  spacing.shift() // remove the first item since it's not applicable
  let spacingNoNearZero = _.filter(spacing, s => s > 2)
  let median = findMedian(spacing)
  let medianNNZ = findMedian(spacingNoNearZero)
  // find other stats
  let max = _.maxBy(departures, n => n.spacing)
  let min = _.minBy(departures, n => n.spacing)
  let mostFreuqentRoute = _.maxBy(_.toPairs(routeStats), n => n[1].cnt)
  let leastFreuqentRoute = _.minBy(_.toPairs(routeStats), n => n[1].cnt)
  let data =
  [
    [`Average time between departures:`, `${_.round(_.mean(spacing), 2)} minutes`],
    [`Average time between departures (<2 removed):`, `${_.round(_.mean(spacingNoNearZero), 2)} minutes`],
    [`Median time between departures:`, `${_.round(median, 2)} minutes`],
    [`Median time between departures (<2 removed):`, `${_.round(medianNNZ, 2)} minutes`],
    [`Max time between departures:`, `${_.round(max.spacing, 2)} minutes`],
    [`Min time between departures:`, `${_.round(min.spacing, 2)} minutes`],
    [`Most trips by one route:`, `${mostFreuqentRoute[0]} with ${mostFreuqentRoute[1].cnt} trips`],
    [`Least trips by one route:`, `${leastFreuqentRoute[0]} with ${leastFreuqentRoute[1].cnt} trips`],
    [`Total trips`, `${totalCnt} runs`]
  ]
  log(table(data))
  process.exit()
})
