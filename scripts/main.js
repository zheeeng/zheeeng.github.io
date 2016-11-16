window.onload = function () {
  // Shims to be fulfilled
  var shims = {
    Scope: null,
    isArrayLike: null,
    forEach: null,
    addEvent: null,
    loopEventByFrame: null,
    cancelLoopEventByFrame: null,
    throttle: null,
    debounce: null
  }

  // shims.Scope
  ;(function (shims) {
    function Scope (context) {
      if (context === void 0) context = {}
      if (typeof context !== 'object' || context === null) throw TypeError('The context isn\'t a object')
      var local = this
      if (Object.defineProperties) {
        Object.defineProperties(local, { '__scope__': { value: context } })
      } else {
        local.__scope__ = context
      }

      return local
    }

    // Set a new value of a specific property in the current scope
    function set (prop, value) {
      var local = this
      if (!(local instanceof Scope)) throw Error('Expect the set method is on a Scope instance')
      if (!(prop in local.__scope__)) local.__scope__[prop] = value
      else throw Error('Can\'t set a value to a existing property multiple times, mutate method is suggested for changing value')
    }

    // Remove a specific property from the current scope
    // This remove always return true unless deletion on a non-configurable property
    // If the silence flag is set to false, a error will be thrown when removing a non-existent property
    function remove (prop, silence) {
      if (silence === void 0) silence = true
      var local = this
      if (!(local instanceof Scope)) throw Error('Expect the remove method is on a Scope instance')
      if (!silence && !(prop in local.__scope__)) throw Error('Can\'t remove a non-existent property')
      return delete local.__scope__[prop]
    }

    // Retrieve && return whether a specific property in the current scope or upper scope on scope chain
    function has (prop) {
      var local = this
      if (!(local instanceof Scope)) throw Error('Expect the has method is on a Scope instance')
      while (local instanceof Scope && !(prop in local.__scope__) && local.__uber__) {
        local = local.__uber__
      }
      return prop in local.__scope__
    }

    // Retrieve && return the first value of a specific property in the current scope or upper scope on scope chain
    function get (prop) {
      var local = this
      if (!(local instanceof Scope)) throw Error('Expect the get method is of a Scope instance')
      while (local instanceof Scope && !(prop in local.__scope__) && local.__uber__) {
        local = local.__uber__
      }
      return local.__scope__[prop]
    }

    // Mutate the first value of a specific property in the current scope or upper scope on scope chain
    // This method return true when mutation operation success, otherwise return false by default
    // If the silence flag is set to false, a error will be thrown when mutation fail instead of returning false value
    function mutate (prop, value, silence) {
      if (silence === void 0) silence = true
      var local = this
      if (!(local instanceof Scope)) throw Error('Expect the mutate method is of a Scope instance')
      while (local instanceof Scope && !(prop in local.__scope__) && local.__uber__) {
        local = local.__uber__
      }
      if (prop in local.__scope__) {
        local.__scope__[prop] = value
        return true
      } else {
        if (silence) return false
        else throw Error('Can\'t mutate a non-existent property')
      }
    }

    // Fork/create a new scope, the property __uber__ on the scope reference to its parent scope.
    function fork () {
      var uberScope = this
      if (!(uberScope instanceof Scope)) throw Error('Expect the fork method is of a Scope instance')
      var local = new Scope()
      if (Object.defineProperties) {
        Object.defineProperties(local, { '__uber__': { value: uberScope } })
      } else {
        local.__uber__ = uberScope
      }
      return local
    }

    if (Object.defineProperties) {
      Object.defineProperties(Scope.prototype, {
        'set': { value: set },
        'remove': { value: remove },
        'has': { value: has },
        'get': { value: get },
        'mutate': { value: mutate },
        'fork': { value: fork }
      })
    } else {
      Scope.prototype.set = set
      Scope.prototype.remove = remove
      Scope.prototype.has = has
      Scope.prototype.get = get
      Scope.prototype.mutate = mutate
      Scope.prototype.fork = fork
    }

    shims.Scope = function ScopeFactory (context) {
      return new Scope(context)
    }
  })(shims)

  // shims.isArrayLike
  ;(function (shims) {
    // return works on array like obj
    shims.isArrayLike = function (arg) {
      return arg && typeof arg.length === 'number' && arg.length > -1 && arg.length % 1 === 0 && typeof arg !== 'function'
    }
  })(shims)

  // shims.forEach
  ;(function (shims) {
    // auxiliaries
    var isArrayLike = shims.isArrayLike

    shims.forEach = (function () {
      if (Array.prototype.forEach) {
        return function (arrayLikeList, fn, thisArg) {
          return Array.prototype.forEach.call(arrayLikeList, fn, thisArg)
        }
      } else {
        return function (arrayLikeList, fn, thisArg) {
          if (!isArrayLike(arrayLikeList)) throw new TypeError('Parameter arrayLikeList isn\'t array like')
          if (typeof fn !== 'function') throw new TypeError('Parameter fn is not a function')
          if (thisArg === void 0) thisArg = this
          var o = Object(arrayLikeList)
          var len = o.length >>> 0
          var k = 0
          while (k < len) {
            if (k in o) fn.call(thisArg, o[k], k, o)
            k++
          }
          return void 0
        }
      }
    })()
  })(shims)

  // shims.addEvent
  ;(function (shims) {
    shims.addEvent = (function () {
      if (window.addEventListener) {
        return function ($el, type, callback) {
          $el.addEventListener(type, callback, false)
        }
      } else if (window.attachEvent) {
        return function ($el, type, callback) {
          $el.attachEvent('on' + type, callback)
        }
      }
    })()
  })(shims)

  // shims.loopEventByFrame, shims.cancelLoopEventByFrame
  ;(function (shims) {
    // Reference: https://gist.github.com/paulirish/1579671
    // MIT license
    var lastTime = 0
    var vendors = ['ms', 'moz', 'webkit', 'o']
    var loop = window.requestAnimationFrame
    var cancel = window.cancelAnimationFrame

    for (var x = 0; x < vendors.length && !loop; ++x) {
      loop = window[vendors[x] + 'RequestAnimationFrame']
      cancel = window[vendors[x] + 'CancelAnimationFrame'] ||
        window[vendors[x] + 'CancelRequestAnimationFrame']
    }

    if (!loop) {
      loop = function (callback) {
        var currentTime = new Date().getTime()
        var timeToCall = Math.max(0, 16 - (currentTime - lastTime))
        var timer = window.setTimeout(function () { callback(currentTime + timeToCall) }, timeToCall)
        lastTime = currentTime + timeToCall
        return timer
      }
    }

    if (!cancel) {
      cancel = window.clearTimeout
    }

    shims.loopEventByFrame = loop
    shims.cancelLoopEventByFrame = cancel
  })(shims)

  // shims.throttle
  ;(function (shims) {
    shims.throttle = function (fn, threshhold, thisArg) {
      if (typeof fn !== 'function') throw new TypeError('Parameter fn is not a function')
      if (threshhold === void 0) threshhold = 250
      var lastTime = 0
      var timer
      return function () {
        if (thisArg === void 0) thisArg = this
        var currentTime = +new Date()
        var args = arguments
        var timeToCall = Math.max(0, threshhold - (currentTime - lastTime))
        window.clearTimeout(timer)
        timer = window.setTimeout(function () {
          fn.apply(thisArg, args)
          lastTime = currentTime + timeToCall
        }, timeToCall)
      }
    }
  })(shims)

  // shims.debounce
  ;(function (shims) {
    shims.debounce = function (fn, delay, thisArg) {
      if (typeof fn !== 'function') throw new TypeError('Parameter fn is not a function')
      if (delay === void 0) delay = 250
      var timer
      return function () {
        if (thisArg === void 0) thisArg = this
        var args = arguments
        window.clearTimeout(timer)
        timer = window.setTimeout(function () {
          fn.apply(thisArg, args)
        }, delay)
      }
    }
  })(shims)

  // Pages initializing
  ;(function initTopicPage (shims) {
    // Import shims
    var Scope = shims.Scope
    var forEach = shims.forEach
    var addEvent = shims.addEvent
    var loopEventByFrame = shims.loopEventByFrame
    var cancelLoopEventByFrame = shims.cancelLoopEventByFrame
    var throttle = shims.throttle
    var debounce = shims.debounce
    // HTML element class hooks
    var classContainer = 'j-overview-container'
    var classItem = 'j-overview-topic-list-item'
    var classChangeAnchor = 'j-overview-topic-change'
    var __itemSelected = 'overview_topic-list-item__selected'
    // For navigation auto scrolling
    // Variable scrollReservZoneWidth define the width of the reserve zone on where the mouse moving event take no effect. The reserve zone locate in the beginning and the end of the scroll mapping zone. The scrollSpeedFactor control the speed of scrolling
    var classNavScrollZone = 'j-overview-topic-nav'
    var scrollReserveZoneWidth = 40
    var scrollFPS = 30
    // Prepared stuffs
    var bodyRect = document.body.getBoundingClientRect()
    var basicDelay = 250 // For debounce delay

    // Utils
    function switchTheme ($el, theme) {
      forEach($el.classList, function (className) {
        if (/^theme\-/.test(className)) $el.classList.remove(className)
      })
      $el.classList.add('theme-' + theme)
    }

    function calculateTheSpeed (distance) {
      var sign = distance > 0 ? 1 : -1
      var sppedFactor = 0.5
      var scrollMinimumSpeed = 1000 / 16
      var speed = sign * scrollMinimumSpeed + sppedFactor * Math.sqrt(sign * distance)
      return sign * speed < sign * distance
        ? {speed: speed, lastStep: false}
        : {speed: distance, lastStep: true}
    }

    // Decoupled processors
    function processContainer ($container, index, $containers) {
      var ctx = this.fork()
      ctx.set('$container', $container)
      // Process the $navs under the $container
      var $navs = $container.getElementsByClassName(classNavScrollZone)
      if ($navs) forEach($navs, processNavigation, ctx)
    }

    function processNavigation ($nav) {
      var ctx = this.fork()
      ctx.set('$nav', $nav)
      ctx.set('$selectedItem', null)

      // Add mouse moving and mouse leaving events on the $nav
      addMouseEventsOnNavigation.call(ctx, $nav)

      // Process the $items under the $nav
      var $items = $nav.getElementsByClassName(classItem)
      if ($items) forEach($items, processItem, ctx)
    }

    // 1. Mouse moving event on navigation scroll the navigation bar
    // 2. Mouse leaving event on navigation scroll the selected heading into view
    function addMouseEventsOnNavigation ($nav) {
      var ctx = this.fork()
      var navRect = $nav.getBoundingClientRect()
      var navClientWidth = $nav.clientWidth
      var scrollFrameId
      // mouseOverX = the relative position X of mouse in $nav.clientWidth
      // mouseOverRateX = mouseOverX in percentage(exclude the reserve zone)
      var mouseOverX, mouseOverRateX
      // navScrollMaxDistance = $nav.scrollWdith - $nav.clientWidth in real time
      // navScrollLeft = $nav.scrollLeft in real time
      // navScrollLeftTo = map the variable mouseOverX in $nav.clientWidth (exclude the reserve zone, I employee the variable mouseOverRateX) to the distance X of navScrollMaxDistance in real time
      // navScrollLeftDistance = navScrollLeftTo - navScrollLeft
      var navScrollMaxDistance, navScrollLeft, navScrollLeftTo, navScrollLeftDistance
      var $selectedItem

      // Auxiliary function
      function scroll (loop) {
        var speedObj = calculateTheSpeed(navScrollLeftDistance)
        $nav.scrollLeft += speedObj.speed
        if (!speedObj.lastStep) scrollFrameId = loopEventByFrame(loop)
      }

      // Mouse moving on the navigation zone scroll the headings into the navigation view zone
      addEvent($nav, 'mousemove', throttle(function (e) {
        mouseOverX = e.pageX - (navRect.left - bodyRect.left)
        mouseOverRateX = mouseOverX < scrollReserveZoneWidth ? 0
          : mouseOverX > navClientWidth - scrollReserveZoneWidth ? 1
          : (mouseOverX - scrollReserveZoneWidth) / (navClientWidth - scrollReserveZoneWidth * 2)
        cancelLoopEventByFrame(scrollFrameId)
        scrollFrameId = loopEventByFrame(function loop () {
          if ($nav.scrollWidth <= navClientWidth) return
          navScrollMaxDistance = $nav.scrollWidth - navClientWidth
          navScrollLeft = $nav.scrollLeft
          navScrollLeftTo = navScrollMaxDistance * mouseOverRateX
          navScrollLeftDistance = navScrollLeftTo - navScrollLeft
          scroll(loop)
        })
      }, 1000 / scrollFPS))
      // Mouse leaving navigation set right the selected item
      addEvent($nav, 'mouseleave', debounce(function (e) {
        $selectedItem = ctx.get('$selectedItem')
        cancelLoopEventByFrame(scrollFrameId)
        scrollFrameId = loopEventByFrame(function loop () {
          if ($nav.scrollWidth <= navClientWidth) return
          navScrollMaxDistance = $nav.scrollWidth - navClientWidth
          navScrollLeft = $nav.scrollLeft
          navScrollLeftTo = Math.min(navScrollMaxDistance, $selectedItem ? $selectedItem.offsetLeft - $nav.offsetLeft : 0)
          navScrollLeftDistance = navScrollLeftTo - navScrollLeft
          scroll(loop)
        })
      }, basicDelay))
    }

    // 1. Process switching themes, it require the execution context contains the $container which to be themed
    // 2. and mutate the variable $selectedItem in the scope chain to the selected item
    function processItem ($item, index, $items) {
      var ctx = this.fork()
      ctx.get('$item')
      ctx.set('$item', $item)

      // Assign the initial selected item to the variable $selectedItem, only the first selected item counts
      if (!ctx.get('$selectedItem') && $item.classList.contains(__itemSelected)) {
        ctx.mutate('$selectedItem', $item)
      }

      var $container = ctx.get('$container')

      // Must the first anchor works on clicking event
      var $anchors = $item.getElementsByClassName(classChangeAnchor)
      var $anchor = $anchors ? $anchors[0] : null

      // Add clicking events on the $anchor
      if ($anchor) {
        addEvent($anchor, 'click', function (e) {
          e.preventDefault()
          switchTheme($container, $anchor.getAttribute('data-theme'))
          forEach($items, function ($item) {
            $item.classList.remove(__itemSelected)
          })
          $item.classList.add(__itemSelected)
          ctx.mutate('$selectedItem', $item)
        })
      }
    }

    // Initialization entry
    var $containers = document.getElementsByClassName(classContainer)
    if ($containers) {
      forEach($containers, processContainer, Scope({}))
    }
  })(shims)
}
