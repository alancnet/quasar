import { h, defineComponent, ref, computed, withDirectives, getCurrentInstance } from 'vue'

import useDark, { useDarkProps } from '../../composables/private/use-dark.js'

import QResizeObserver from '../resize-observer/QResizeObserver.js'
import QScrollObserver from '../scroll-observer/QScrollObserver.js'

import TouchPan from '../../directives/TouchPan.js'

import { between } from '../../utils/format.js'
import { setVerticalScrollPosition, setHorizontalScrollPosition } from '../../utils/scroll.js'
import { hMergeSlot } from '../../utils/private/render.js'
import debounce from '../../utils/debounce.js'
import { vmHasListener } from '../../utils/private/vm.js'

const axisList = [ 'vertical', 'horizontal' ]
const dirProps = {
  vertical: { offset: 'offsetY', scroll: 'scrollTop', dir: 'down', dist: 'y' },
  horizontal: { offset: 'offsetX', scroll: 'scrollLeft', dir: 'right', dist: 'x' }
}

export default defineComponent({
  name: 'QScrollArea',

  props: {
    ...useDarkProps,

    thumbStyle: Object,
    verticalThumbStyle: Object,
    horizontalThumbStyle: Object,

    barStyle: [ Array, String, Object ],
    verticalBarStyle: [ Array, String, Object ],
    horizontalBarStyle: [ Array, String, Object ],

    contentStyle: [ Array, String, Object ],
    contentActiveStyle: [ Array, String, Object ],

    delay: {
      type: [ String, Number ],
      default: 1000
    },

    visible: {
      type: Boolean,
      default: null
    }
  },

  emits: [ 'scroll' ],

  setup (props, { slots, emit }) {
    // state management
    const tempShowing = ref(false)
    const panning = ref(false)
    const hover = ref(false)

    // other...
    const container = {
      vertical: ref(0),
      horizontal: ref(0)
    }

    const scroll = {
      vertical: {
        ref: ref(null),
        position: ref(0),
        size: ref(0)
      },

      horizontal: {
        ref: ref(null),
        position: ref(0),
        size: ref(0)
      }
    }

    const vm = getCurrentInstance()

    const isDark = useDark(props, vm.proxy.$q)

    let timer, panRefPos

    const targetRef = ref(null)

    const classes = computed(() =>
      'q-scrollarea'
      + (isDark.value === true ? ' q-scrollarea--dark' : '')
    )

    scroll.vertical.percentage = computed(() => {
      const p = between(scroll.vertical.position.value / (scroll.vertical.size.value - container.vertical.value), 0, 1)
      return Math.round(p * 10000) / 10000
    })
    scroll.vertical.thumbHidden = computed(() =>
      (
        (props.visible === null ? hover.value : props.visible) !== true
        && tempShowing.value === false
        && panning.value === false
      ) || scroll.vertical.size.value <= container.vertical.value + 1
    )
    scroll.vertical.thumbSize = computed(() =>
      Math.round(
        between(
          container.vertical.value * container.vertical.value / scroll.vertical.size.value,
          50,
          container.vertical.value
        )
      )
    )
    scroll.vertical.style = computed(() => {
      const thumbSize = scroll.vertical.thumbSize.value
      const pos = scroll.vertical.percentage.value * (container.vertical.value - thumbSize)
      return {
        ...props.thumbStyle,
        ...props.verticalThumbStyle,
        top: `${ pos }px`,
        height: `${ thumbSize }px`
      }
    })
    scroll.vertical.thumbClass = computed(() =>
      'q-scrollarea__thumb q-scrollarea__thumb--v absolute-right'
      + (scroll.vertical.thumbHidden.value === true ? ' q-scrollarea__thumb--invisible' : '')
    )
    scroll.vertical.barClass = computed(() =>
      'q-scrollarea__bar q-scrollarea__bar--v absolute-right'
      + (scroll.vertical.thumbHidden.value === true ? ' q-scrollarea__bar--invisible' : '')
    )

    scroll.horizontal.percentage = computed(() => {
      const p = between(scroll.horizontal.position.value / (scroll.horizontal.size.value - container.horizontal.value), 0, 1)
      return Math.round(p * 10000) / 10000
    })
    scroll.horizontal.thumbHidden = computed(() =>
      (
        (props.visible === null ? hover.value : props.visible) !== true
        && tempShowing.value === false
        && panning.value === false
      ) || scroll.horizontal.size.value <= container.horizontal.value + 1
    )
    scroll.horizontal.thumbSize = computed(() =>
      Math.round(
        between(
          container.horizontal.value * container.horizontal.value / scroll.horizontal.size.value,
          50,
          container.horizontal.value
        )
      )
    )
    scroll.horizontal.style = computed(() => {
      const thumbSize = scroll.horizontal.thumbSize.value
      const pos = scroll.horizontal.percentage.value * (container.horizontal.value - thumbSize)
      return {
        ...props.thumbStyle,
        ...props.horizontalThumbStyle,
        left: `${ pos }px`,
        width: `${ thumbSize }px`
      }
    })
    scroll.horizontal.thumbClass = computed(() =>
      'q-scrollarea__thumb q-scrollarea__thumb--h absolute-bottom'
      + (scroll.horizontal.thumbHidden.value === true ? ' q-scrollarea__thumb--invisible' : '')
    )
    scroll.horizontal.barClass = computed(() =>
      'q-scrollarea__bar q-scrollarea__bar--h absolute-bottom'
      + (scroll.horizontal.thumbHidden.value === true ? ' q-scrollarea__bar--invisible' : '')
    )

    const mainStyle = computed(() => (
      scroll.vertical.thumbHidden.value === true || scroll.horizontal.thumbHidden.value === true
        ? props.contentStyle
        : props.contentActiveStyle
    ))

    const thumbVertDir = [ [
      TouchPan,
      e => { onPanThumb(e, 'vertical') },
      void 0,
      {
        vertical: true,
        prevent: true,
        mouse: true,
        mouseAllDir: true
      }
    ] ]

    const thumbHorizDir = [ [
      TouchPan,
      e => { onPanThumb(e, 'horizontal') },
      void 0,
      {
        horizontal: true,
        prevent: true,
        mouse: true,
        mouseAllDir: true
      }
    ] ]

    // we have lots of listeners, so
    // ensure we're not emitting same info
    // multiple times
    const emitScroll = debounce(() => {
      const info = { ref: vm.proxy }

      axisList.forEach(axis => {
        const data = scroll[ axis ]

        info[ axis + 'Position' ] = data.position.value
        info[ axis + 'Percentage' ] = data.percentage.value
        info[ axis + 'Size' ] = data.size.value
        info[ axis + 'ContainerSize' ] = container[ axis ].value
      })

      emit('scroll', info)
    }, 0)

    function localSetScrollPosition (axis, offset, duration) {
      if (axisList.includes(axis) === false) {
        console.error('[QScrollArea]: wrong first param of setScrollPosition (vertical/horizontal)')
        return
      }

      const fn = axis === 'vertical'
        ? setVerticalScrollPosition
        : setHorizontalScrollPosition

      fn(targetRef.value, offset, duration)
    }

    function updateContainer ({ height, width }) {
      let change = false

      if (container.vertical.value !== height) {
        container.vertical.value = height
        change = true
      }

      if (container.horizontal.value !== width) {
        container.horizontal.value = width
        change = true
      }

      change === true && startTimer()
    }

    function updateScroll ({ position }) {
      let change = false

      if (scroll.vertical.position.value !== position.top) {
        scroll.vertical.position.value = position.top
        change = true
      }

      if (scroll.horizontal.position.value !== position.left) {
        scroll.horizontal.position.value = position.left
        change = true
      }

      change === true && startTimer()
    }

    function updateScrollSize ({ height, width }) {
      if (scroll.horizontal.size.value !== width) {
        scroll.horizontal.size.value = width
        startTimer()
      }

      if (scroll.vertical.size.value !== height) {
        scroll.vertical.size.value = height
        startTimer()
      }
    }

    function onPanThumb (e, axis) {
      const data = scroll[ axis ]

      if (e.isFirst === true) {
        if (data.thumbHidden.value === true) {
          return
        }

        panRefPos = data.position.value
        panning.value = true
      }
      else if (panning.value !== true) {
        return
      }

      if (e.isFinal === true) {
        panning.value = false
      }

      const dProp = dirProps[ axis ]
      const containerSize = container[ axis ].value

      const multiplier = (data.size.value - containerSize) / (containerSize - data.thumbSize.value)
      const distance = e.distance[ dProp.dist ]
      const pos = panRefPos + (e.direction === dProp.dir ? 1 : -1) * distance * multiplier

      setScroll(pos, axis)
    }

    function onMousedown (evt, axis) {
      const data = scroll[ axis ]

      if (data.thumbHidden.value !== true) {
        const pos = evt[ dirProps[ axis ].offset ] - data.thumbSize.value / 2
        setScroll(pos / container[ axis ].value * data.size.value, axis)

        // activate thumb pan
        if (data.ref.value !== null) {
          data.ref.value.dispatchEvent(new MouseEvent(evt.type, evt))
        }
      }
    }

    function onVerticalMousedown (evt) {
      onMousedown(evt, 'vertical')
    }

    function onHorizontalMousedown (evt) {
      onMousedown(evt, 'horizontal')
    }

    function startTimer () {
      if (tempShowing.value === true) {
        clearTimeout(timer)
      }
      else {
        tempShowing.value = true
      }

      timer = setTimeout(() => { tempShowing.value = false }, props.delay)
      vmHasListener(vm, 'onScroll') === true && emitScroll()
    }

    function setScroll (offset, axis) {
      targetRef.value[ dirProps[ axis ].scroll ] = offset
    }

    function onMouseenter () {
      hover.value = true
    }

    function onMouseleave () {
      hover.value = false
    }

    // expose public methods
    Object.assign(vm.proxy, {
      getScrollTarget: () => targetRef.value,
      getScrollPosition: () => ({
        top: scroll.vertical.position.value,
        left: scroll.horizontal.position.value
      }),
      setScrollPosition: localSetScrollPosition,
      setScrollPercentage (axis, percentage, duration) {
        localSetScrollPosition(
          axis,
          percentage * (scroll[ axis ].size.value - container[ axis ].value),
          duration
        )
      }
    })

    return () => {
      return h('div', {
        class: classes.value,
        onMouseenter,
        onMouseleave
      }, [
        h('div', {
          ref: targetRef,
          class: 'q-scrollarea__container scroll relative-position fit hide-scrollbar'
        }, [
          h('div', {
            class: 'q-scrollarea__content absolute',
            style: mainStyle.value
          }, hMergeSlot(slots.default, [
            h(QResizeObserver, {
              onResize: updateScrollSize
            })
          ])),

          h(QScrollObserver, {
            axis: 'both',
            onScroll: updateScroll
          })
        ]),

        h(QResizeObserver, {
          onResize: updateContainer
        }),

        h('div', {
          class: scroll.vertical.barClass.value,
          style: [ props.barStyle, props.verticalBarStyle ],
          'aria-hidden': 'true',
          onMousedown: onVerticalMousedown
        }),

        h('div', {
          class: scroll.horizontal.barClass.value,
          style: [ props.barStyle, props.horizontalBarStyle ],
          'aria-hidden': 'true',
          onMousedown: onHorizontalMousedown
        }),

        withDirectives(
          h('div', {
            ref: scroll.vertical.ref,
            class: scroll.vertical.thumbClass.value,
            style: scroll.vertical.style.value,
            'aria-hidden': 'true'
          }),
          thumbVertDir
        ),

        withDirectives(
          h('div', {
            ref: scroll.horizontal.ref,
            class: scroll.horizontal.thumbClass.value,
            style: scroll.horizontal.style.value,
            'aria-hidden': 'true'
          }),
          thumbHorizDir
        )
      ])
    }
  }
})
