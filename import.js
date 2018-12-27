const gtfs = require('gtfs')
const mongoose = require('mongoose')
const config = {
  mongoUrl: 'mongodb://localhost:27017/gtfs',
  agencies: [
    {
      agency_key: 'whatcom-transit-authority',
      // url: 'https://github.com/whatcomtrans/publicwtadata/blob/master/GTFS/wta_gtfs_latest.zip'
      path: '/home/danielhep/Downloads/publicwtadata-master/GTFS/wta_gtfs_latest.zip'
    }
  ]
}

mongoose.connect(config.mongoUrl, { useNewUrlParser: true })

gtfs.import(config)
  .then(() => {
    console.log('Import Successful')
    // return mongoose.connection.close()
  })
  .catch(err => {
    console.error(err)
  })
