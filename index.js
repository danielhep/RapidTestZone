const mongoose = require('mongoose')
const mongoURI = 'mongodb://localhost:27017/gtfs'
const _ = require('lodash')

const Trips = require('gtfs/models/gtfs/trip')
const StopTimes = require('gtfs/models/gtfs/stop-time')
const Routes = require('gtfs/models/gtfs/route')

const routeNames = ['14', '190']
const stopId = 208

mongoose.connect(mongoURI, { useNewUrlParser: true })
var db = mongoose.connection
db.on('error', console.error.bind(console, 'connection error:'))
db.once('open', async function () {
  // get a list of route ids from route names
  let routes = await Routes.find({ route_short_name: { $in: routeNames } }).exec()
  let routeIds = []
  routes.forEach(item => {
    routeIds.push(item.route_id)
  })
  // get a list of trips for routes
  let trips = await Trips.find({ route_id: { $in: routeIds } }, 'trip_id route_id service_id').exec()
  let tripIds = []
  trips.forEach(item => {
    tripIds.push(item.trip_id)
  })
  // times for the above trips at a specific stop
  let stopTimes = await StopTimes.find(
    { trip_id: { $in: tripIds }, stop_id: stopId, pickup_type: 0 },
    'trip_id departure_time',
    { sort: { departure_time: 1 } }
  ).exec()
  stopTimes.forEach(stopTime => {
    let routeId = _.find(trips, { trip_id: stopTime.trip_id }).route_id
    let routeName = _.find(routes, { route_id: routeId }).route_short_name
    console.log(`Route ${routeName} departing at ${stopTime.departure_time}`)
  })
  // console.log(stopTimes)
})
