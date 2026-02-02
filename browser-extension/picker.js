// FlowSelect Browser Extension - Element Picker
// SVG-based highlight overlay (inspired by uBlock epicker.js)

class FlowSelectPicker {
  constructor(options = {}) {
    this.onSelect = options.onSelect || (() => {});
    this.onCancel = options.onCancel || (() => {});
    this.overlay = null;
    this.svgRoot = null;
    this.highlightPath = null;
    this.currentElement = null;
    this.isActive = false;

    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleClick = this.handleClick.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleContextMenu = this.handleContextMenu.bind(this);
  }

  start() {
    if (this.isActive) return;
    this.isActive = true;
    this.createOverlay();
    this.attachListeners();
    document.body.classList.add('flowselect-picker-active');
  }

  stop() {
    if (!this.isActive) return;
    this.isActive = false;
    this.detachListeners();
    this.removeOverlay();
    document.body.classList.remove('flowselect-picker-active');
    this.currentElement = null;
  }

  createOverlay() {
    // Create container
    this.overlay = document.createElement('div');
    this.overlay.id = 'flowselect-picker-overlay';

    // Create SVG for highlighting
    const svgNS = 'http://www.w3.org/2000/svg';
    this.svgRoot = document.createElementNS(svgNS, 'svg');
    this.svgRoot.setAttribute('class', 'flowselect-svg-overlay');

    this.highlightPath = document.createElementNS(svgNS, 'path');
    this.highlightPath.setAttribute('class', 'flowselect-highlight');
    this.svgRoot.appendChild(this.highlightPath);

    this.overlay.appendChild(this.svgRoot);
    document.body.appendChild(this.overlay);
  }

  removeOverlay() {
    if (this.overlay && this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
    }
    this.overlay = null;
    this.svgRoot = null;
    this.highlightPath = null;
  }

  attachListeners() {
    console.log('[FlowSelect Picker] attachListeners called');
    document.addEventListener('mousemove', this.handleMouseMove, true);
    document.addEventListener('keydown', this.handleKeyDown, true);
    document.addEventListener('contextmenu', this.handleContextMenu, true);
    // 直接在 overlay 上监听点击
    if (this.overlay) {
      this.overlay.addEventListener('click', this.handleClick);
    }
  }

  detachListeners() {
    document.removeEventListener('mousemove', this.handleMouseMove, true);
    document.removeEventListener('keydown', this.handleKeyDown, true);
    document.removeEventListener('contextmenu', this.handleContextMenu, true);
    if (this.overlay) {
      this.overlay.removeEventListener('click', this.handleClick);
    }
  }

  handleMouseMove(event) {
    event.preventDefault();
    event.stopPropagation();

    const element = this.getElementFromPoint(event.clientX, event.clientY);
    if (element && element !== this.currentElement) {
      this.currentElement = element;
      this.highlightElement(element);
    }
  }

  handleClick(event) {
    console.log('[FlowSelect Picker] handleClick triggered');
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    console.log('[FlowSelect Picker] currentElement:', this.currentElement);
    if (this.currentElement) {
      const videoData = this.extractVideoData(this.currentElement);
      console.log('[FlowSelect Picker] extractVideoData result:', videoData);
      if (videoData) {
        console.log('[FlowSelect Picker] Calling onSelect');
        this.onSelect(videoData);
      } else {
        console.log('[FlowSelect Picker] No video data found');
      }
    }
  }

  handleKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.onCancel();
    }
  }

  handleContextMenu(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    this.onCancel();
  }

  getElementFromPoint(x, y) {
    // Temporarily hide overlay to get element underneath
    if (this.overlay) {
      this.overlay.style.pointerEvents = 'none';
    }
    const element = document.elementFromPoint(x, y);
    if (this.overlay) {
      this.overlay.style.pointerEvents = '';
    }
    return element;
  }

  highlightElement(element) {
    if (!this.highlightPath || !element) return;

    const rect = element.getBoundingClientRect();

    // Fixed 定位直接使用视口坐标
    const x = rect.left;
    const y = rect.top;
    const w = rect.width;
    const h = rect.height;

    const path = `M${x},${y} L${x + w},${y} L${x + w},${y + h} L${x},${y + h} Z`;
    this.highlightPath.setAttribute('d', path);

    // 使用视口尺寸
    this.svgRoot.setAttribute('viewBox', `0 0 ${window.innerWidth} ${window.innerHeight}`);
  }

  extractVideoData(element) {
    // Check if element is a video
    if (element.tagName === 'VIDEO') {
      return {
        src: element.src || element.currentSrc,
        title: element.title || null
      };
    }

    // Check for video inside element
    const video = element.querySelector('video');
    if (video) {
      return {
        src: video.src || video.currentSrc,
        title: video.title || null
      };
    }

    // Check for iframe (YouTube, Vimeo, etc.)
    if (element.tagName === 'IFRAME') {
      return {
        src: element.src,
        title: element.title || null,
        isEmbed: true
      };
    }

    // Check for source elements
    const source = element.querySelector('source');
    if (source) {
      return {
        src: source.src,
        title: null
      };
    }

    return null;
  }
}

// Export for content script
window.FlowSelectPicker = FlowSelectPicker;
