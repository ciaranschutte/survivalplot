import d3 from 'd3'
import defaultsDeep from 'lodash.defaultsdeep'
import uniqueId from 'lodash.uniqueid'
import inRange from 'lodash.inrange'

function noop() {}

const linearScale = d3.scale ? d3.scale.linear : d3.scaleLinear

const defaultOptions = {
  onMouseEnterDonor: noop,
  onMouseLeaveDonor: noop,
  onClickDonor: noop,
  palette: ['#0e6402', '#c20127', '#00005d'],
  xAxisLabel: 'Duration (days)',
  yAxisLabel: 'Survival Rate',
  margins: {
    top: 20,
    right: 20,
    bottom: 46,
    left: 60,
  },
}

export function renderPlot (params) {
  const {
    container,
    dataSets,
    disabledDataSets = [],
    onMouseEnterDonor,
    onMouseLeaveDonor,
    onClickDonor,
    palette,
    xAxisLabel,
    yAxisLabel,
    margins,
    getSetSymbol,
  } = defaultsDeep({}, params, defaultOptions)

  let svg = d3.select(container).selectAll('svg')

  if(svg.empty()) {
    svg = d3.select(container).append('svg')
  } else {
    svg
      .attr('width', 0) // remove previously set width so svg does not stretch container before reading it's width
      .selectAll('*')
      .remove();
  }

  const containerBounds = container.getBoundingClientRect()

  var outerWidth = containerBounds.width
  var outerHeight = params.height || outerWidth * 0.5

  var axisWidth = outerWidth - margins.left - margins.right
  var axisHeight = outerHeight - margins.top - margins.bottom

  var longestDuration = Math.max(...dataSets
      .filter(data => disabledDataSets.indexOf(data) < 0 && data.donors.length)
      .map(data => data.donors.slice(-1)[0].time))
  
  var xDomain = params.xDomain || [0, longestDuration]
  var onDomainChange = params.onDomainChange

  var x = linearScale()
    .range([0, axisWidth])

  var y = linearScale()
    .range([axisHeight, 0])

  var xAxis = d3.svg
      ? d3.svg.axis().scale(x).orient('bottom')
      : d3.axisBottom().scale(x)

  var yAxis = d3.svg
    ? d3.svg.axis().scale(y).ticks(5).tickSize(axisWidth).orient('right')
    : d3.axisLeft().scale(y)

  svg
    .attr('width', outerWidth)
    .attr('height', outerHeight)

  var wrapper = d3.select(svg.node()).append('svg:g')
      .attr('class', 'wrapper')
      .attr('transform', 'translate(' + margins.left + ',' + margins.top + ')')

  x.domain([xDomain[0], xDomain[1]])
  y.domain([0, 1])

  // Draw x axis
  wrapper.append('svg:g')
    .attr('class', 'x axis')
    .attr('transform', 'translate( 0,' + axisHeight + ')')
    .call(xAxis)
    .append('svg:text')
      .attr('class', 'axis-label')
      .attr('dy', 30)
      .attr('x', axisWidth / 2)
      .style('text-anchor', 'end')
      .text(xAxisLabel)

  // Draw y axis
  var gy = wrapper.append('svg:g')
    .attr('class', 'y axis')
    .call(yAxis)
  gy.selectAll('g')
    .filter(d => d)
    .classed('minor', true)
  gy.selectAll('text')
      .attr('x', -20)
  gy.append('svg:text')
      .attr('class', 'axis-label')
      .attr('text-anchor', 'middle')
      .attr('transform', 'rotate(-90)')
      .attr('y', -40)
      .attr('x', -(axisHeight / 2))
      .text(yAxisLabel)

  function brushed(selection) {
    if (selection[1] - selection[0] > 1) {
      onDomainChange(selection)
    }
  }

  var brush;
  if(d3.svg) {
    brush = d3.svg.brush().x(x)
      .on('brushend', function brushend() {
        var extent = brush.extent()
        svg.select('.brush').call(brush.clear())
        brushed(extent);
      })
  } else {
    brush = d3.brushX()
      .extent([[0, 0], [axisWidth, axisHeight]])
      .on('end', function() {
        var selection = d3.event.selection;
        if (!selection) return;
        wrapper.select('.brush').call(brush.move, null)
        brushed(selection);
      })
  }

  wrapper.append('svg:g')
    .attr('class', 'brush')
    .call(brush)
    .selectAll('rect')
    .attr('height', axisHeight)

  var maskName = 'mask_' + uniqueId()

  svg.append('svg:clipPath')
    .attr('id', maskName)
    .append('svg:rect')
      .attr('x', 0)
      .attr('y', -10)
      .attr('width', axisWidth)
      .attr('height', axisHeight + margins.top)

  dataSets.forEach(function (data, i) {
    if (disabledDataSets.indexOf(data) >= 0) {
      return
    }

    var line = d3.svg
      ? d3.svg.area().interpolate('step-before')
      : d3.area().curve(d3.curveStepBefore)

    line.x(function(p) { return x(p.x) })
      .y(function(p) { return y(p.y) })

    var setGroup = wrapper.append('svg:g')
      .attr('class', 'serie')
      .attr('set-id', data.meta.id)
      .attr('clip-path', 'url(' + window.location.href + '#' + maskName + ')')

    var setColor = palette[i % palette.length]

    var donorsInRange = data.donors.filter(function (donor, i, arr) {
      return inRange(donor.time, xDomain[0], xDomain[1] + 1) ||
        ( arr[i - 1] && donor.time >= xDomain[1] && arr[i - 1].time <= xDomain[1] ) ||
        ( arr[i + 1] && donor.time <= xDomain[0] && arr[i + 1].time >= xDomain[0] )
    })

    // Draw the data as an svg path
    setGroup.append('svg:path')
      .datum(donorsInRange
        .map(function (d) { return {x: d.time, y: d.survivalEstimate} }))
      .attr('class', 'line')
      .attr('d', line)
      .attr('stroke', setColor)

    // Draw the data points as circles
    var markers = setGroup.selectAll('circle')
      .data(donorsInRange)
      .enter()

    markers = markers.append('svg:line')
      .attr('class', 'point-line')
      .attr('status', function (d) { return d.status })
      .attr('x1', function(d) { return x(d.time) })
      .attr('y1', function(d) { return y(d.survivalEstimate) })
      .attr('x2', function(d) { return x(d.time) })
      .attr('y2', function(d) { return y(d.survivalEstimate) + (d.status === 'deceased' ? 10 : -5) })
      .attr('stroke', setColor)

    markers
      .on('mouseover', function (d) {
        onMouseEnterDonor(d3.event, d)
      })
      .on('mouseout', function (d) {
        onMouseLeaveDonor(d3.event, d)
      })
      .on('click', function (d) {
        onClickDonor(d3.event, d)
      })

    if (getSetSymbol) {
      setGroup.selectAll('circle')
        .data(donorsInRange.slice(-1))
        .enter()
        .append('svg:text')
          .attr('x', d => Math.min(axisWidth, x(d.time)))
          .attr('y', d => y(d.survivalEstimate))
          .attr('dy', '-0.5em')
          .attr('text-anchor', 'end')
          .attr('fill', setColor)
          .append('svg:tspan')
            .html(getSetSymbol(data, dataSets))
    }
  })

  return svg
}