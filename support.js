function findMedian (array) {
  array.sort((a, b) => a - b)

  var half = Math.floor(array.length / 2)
  // find median
  if (array.length % 2) {
    return array[half]
  } else {
    return (array[half - 1] + array[half]) / 2.0
  }
}

module.exports = { findMedian }
