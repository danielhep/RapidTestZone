const mongoose = require('mongoose')
const { DateTime, Interval, Duration } = require('luxon')
const mongoURI = 'mongodb://localhost:27017/gtfs'
const _ = require('lodash')
const colors = require('colors')

const Trips = require('gtfs/models/gtfs/trip')
const StopTimes = require('gtfs/models/gtfs/stop-time')
const Routes = require('gtfs/models/gtfs/route')
const Stops = require('gtfs/models/gtfs/stop')
const Calendars = require('gtfs/models/gtfs/calendar')
const CalendarDates = require('gtfs/models/gtfs/calendar-date')

const log = console.log

const routeNames = ['80S', '190S', '190', '14', '108', '11', '108S']
const stopCode = 2083
const frequentService = 15

const searchDate = DateTime.local(2019, 1, 9)
mongoose.connect(mongoURI, { useNewUrlParser: true })
var db = mongoose.connection
db.on('error', console.error.bind(console, 'connection error:'))
db.once('open', async function () {
  // get today's date, service codes for today's date
  let dayName = searchDate.toFormat('EEEE').toLowerCase()
  let calendars = await Calendars.find().exec()
  let serviceIds = []
  calendars.forEach(item => {
    // also ensure that today is within the valid date range
    let startDate = DateTime.fromFormat(item.start_date.toString(), 'yyyyLLdd')
    let endDate = DateTime.fromFormat(item.end_date.toString(), 'yyyyLLdd')
    let interval = Interval.fromDateTimes(startDate, endDate)
    if (item[dayName] && interval.contains(searchDate)) { serviceIds.push(item.service_id) }
  })

  // add service IDs for calendar-dates
  let calendarDates = await CalendarDates.find().exec()
  calendarDates.forEach(item => {
    let date = DateTime.fromFormat(item.date.toString(), 'yyyyLLdd')
    if (+date === +searchDate) {
      if (item.exception_type === 1) {
        serviceIds.push(item.service_id)
      } else if (item.exception_type === 2) {
        serviceIds = _.remove(serviceIds, item.service_id)
      }
    }
  })

  log(serviceIds)
  // find bus stop ID from google maps ID
  let stops = await Stops.find({ stop_code: stopCode }, 'stop_id').exec()
  let stopId = stops[0].stop_id
  // get a list of route ids from route names
  let routes = await Routes.find({ route_short_name: { $in: routeNames } }, 'route_id route_short_name').exec()
  let routeIds = []
  routes.forEach(item => {
    routeIds.push(item.route_id)
  })
  // get a list of trips for routes
  let trips = await Trips.find(
    { route_id: { $in: routeIds }, service_id: { $in: serviceIds } },
    'trip_id route_id service_id'
  ).exec()
  let tripIds = []
  trips.forEach(item => {
    tripIds.push(item.trip_id)
  })
  // times for the above trips at a specific stop
  let stopTimes = await StopTimes.find(
    // pickup type 0: picks up passengers
    { trip_id: { $in: tripIds }, stop_id: stopId, pickup_type: 0 },
    'trip_id departure_time',
    { sort: { departure_time: 1 } }
  ).exec()
  let departures = []
  stopTimes.forEach(stopTime => {
    let routeId = _.find(trips, { trip_id: stopTime.trip_id }).route_id
    let routeName = _.find(routes, { route_id: routeId }).route_short_name
    departures.push({
      routeId,
      routeName,
      time: DateTime.fromFormat(stopTime.departure_time, 'H:mm:ss')
    })
  })

  departures.sort((a, b) => (a.time.toSeconds() - b.time.toSeconds()))

  let lastTime = departures[0].time
  let hourlyStats = {}
  let avg = 0; let cnt = 0

  departures.forEach(item => {
    if (lastTime.hour !== item.time.hour) {
      log(`------- ${item.time.toFormat("h' 'a")} ------- `)
    }
    let timeSinceLast = Math.round(Interval.fromDateTimes(lastTime, item.time).length('minutes'))
    let timeSinceLastString = timeSinceLast > frequentService ? String(timeSinceLast).red : String(timeSinceLast).green
    log(`Route ${item.routeName}`.yellow + ` departing at ${item.time.toLocaleString(DateTime.TIME_SIMPLE)} (${timeSinceLastString})`)
    lastTime = item.time
    cnt++
    avg += timeSinceLast
  })
  avg /= cnt
  log(`Average time between departures: ${avg}`)
})
