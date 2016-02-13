//// conversion functions
function toDevice(x) {
  // convert from pixels to device coordinates
  return x*window.devicePixelRatio;
}

function fromDevice(x) {
  // convert from device coordinates to pixels
  return x/window.devicePixelRatio;
}

//// vector class
function Vector(x, y) {
  this.x = x;
  this.y = y;
}

function vadd(v1, v2) {
  // add two vectors
  return new Vector(v1.x + v2.x, v1.y + v2.y);
}

function vsub(v1, v2) {
  // subtract two vectors
  return new Vector(v1.x - v2.x, v1.y - v2.y);
}

function vscale(a, v) {
  // multiply vector by scalar
    return new Vector(a*v.x, a*v.y);
}

function vnorm2(v) {
  // calculate norm-squared of vector
  return v.x*v.x + v.y*v.y;
}

function vnorm(v) {
  // calculate norm of vector
  return Math.sqrt(vnorm2(v));
}

function toggleButton(btn, state) {
  // toggle the button or set button
  if (state === undefined) {
    btn.classList.toggle('down');
  } else if (state) {
    btn.classList.add('down');
  } else {
    btn.classList.remove('down');
  }
}

function registerToolById(btnid, props) {
  // register a tool button by id
  btn = document.getElementById(btnid);
  toolbox[btnid] = btn;
  toolprops[btnid] = props || {};
  btn.addEventListener("click", function() { selectTool(this); });
}

function selectTool(btn) {
  // select a tool
  for (other in toolbox) {
    if (toolbox.hasOwnProperty(other))
      toggleButton(toolbox[other], false);
  }

  toggleButton(btn, true);

  if (instance) {
    if (btn.id == 'brushbtn') {
      instance.selectMode('brush');
    } else {
      instance.selectMode('contour');
    }
  }

  canvas.focus();
}

//// The Segmenter class
function Segmenter(canvas, imageName, imagePath) {
  //// attributes
  this.canvas = canvas;
  this.imageName = imageName;
  this.imagePath = imagePath;
  this.looping = false;
  this.overlayValid = false;
  this.overlayInvalidRect = [0, 0, 0, 0]; // xmin, xmax, ymin, ymax
  this.drawMode = 'contour';
  this.brushSize = 25.0;
  this.minBrush = 1;
  this.maxBrush = 200;
  this.oldMouse = new Vector(0, 0);
  this.mouse = new Vector(0, 0);
  this.currentColor = "#FF0000";
  this.painting = false;
  this.invalidateAt = undefined;
  this.nMipmaps = 4;
  this.maxUndo = 1024;
  this.maxUndoPixels = 256*1024*1024;
  this.undoHistory = [];
  this.undoPointer = -1;
  this.eraserOn = false;
  this.hoverOutPoint = Vector(0, 0);
  this.curveSmoothFactor = 1.0;
  this.minSmoothFactor = 0.0;
  this.maxSmoothFactor = 25.0;
  this.freehand = false;
  this.closenessThreshold = 3.0;
  this.saveStyle = 'matlab_rle';
  this.saving = false;
  this.hideSegmentation = false;
  this.invertImage = false;
  this.invertedImage = null;
  this.brightenImage = false;
  this.brighterImage = null;

  //// member functions
  //// setup and flow control
  this.setup = function() {
    this.imageLoading = true;
    this.imageLoaded = false;
    this.imageError = false;

    document.getElementById("invertedimg").style.visibility = 'hidden';
    document.getElementById("brightimg").style.visibility = 'hidden';
    document.getElementById("nosegments").style.visibility = 'hidden';

    // start loading the image, set up handlers
    this.image = new Image();
    var s = this;

    this.image.onload = function() {
        s.imageLoaded = true;
      };
    this.image.onerror = function() {
        s.imageError = true;
      };

    this.image.src = this.imageName;

    // register tools
    registerToolById('brushbtn', {
        'sizeslider': document.getElementById('brushslider'),
        'sizevalue': document.getElementById('brushsize'),
        'span': document.getElementById('brushctrl')
      });
    registerToolById('polybtn', {
        'smoothslider': document.getElementById('contourslider'),
        'smoothvalue': document.getElementById('contoursize'),
        'span': document.getElementById('contourctrl')
      });
    selectTool(toolbox['polybtn']);

    // add click event for tag adding
    document.getElementById('plustag').addEventListener('click', function() {
        s.addNextTag();
      });

    // add the first tag
    s.addNextTag();
    
    // add click event for eraser
    var eraserinput = document.getElementById('tagnameeraser');
    var eraserswatch = document.getElementById('swatcheraser');
    eraserinput.addEventListener('click', function() {
        s.enableEraseMode();
        canvas.focus();
      });
    eraserswatch.addEventListener('click', function() {
        s.enableEraseMode();
        canvas.focus();
      });

    // start a loop waiting for the image to load
    this.loop();
  }

  this.loop = function(rate) {
    // start executing draw() at the given framerate (default: 60fps)
    this.noLoop();
    rate = rate || 60.0;
    this.looping = true;

    var s = this;
    this.loopTimer = setInterval(function() {
        s.draw();
      }, 1000.0/rate);
  }

  this.noLoop = function() {
    // stop looping
    if (this.looping) {
      clearTimeout(this.loopTimer);
      this.looping = false;
    }
  }

  this.redraw = function() {
    // if not looping, redraw the canvas
    // if looping, simply wait for next redraw
    if (!this.looping) {
      this.draw();
    }
  }

  //// convenience functions
  this.setMouse = function(m) {
    this.oldMouse = this.mouse;
    this.mouse = m;
  }

  this.normalizeMousePosition = function(e) {
    // figure out mouse position taking into account borders
    if (this.mouseOffset === undefined) {
      var computedStyle = window.getComputedStyle(canvas, null);
      var topBorder = parseInt(computedStyle.getPropertyValue("border-top-width"), 10);
      var leftBorder = parseInt(computedStyle.getPropertyValue("border-left-width"), 10);
      var rect = canvas.getBoundingClientRect();
      this.mouseOffset = new Vector(rect.left + leftBorder, rect.top + topBorder);
    }
    return vsub(new Vector(e.clientX, e.clientY), this.mouseOffset);
  }

  this.extractMousePosition = function(e) {
    // extract mouse position from event
    var en = this.normalizeMousePosition(e);
    return new Vector(toDevice(en.x), toDevice(en.y));
  }

  this.getImageRectOnWindow = function() {
    var x0 = canvas.width/2 - this.image.width*this.izoom.s;
  }

  this.isInImage = function(v) {
    if (!this.izoom) return false;
    // check whether a particular point on the canvas is within the image extents
    var v1 = this.imageToCanvas(new Vector(0, 0));
    var v2 = this.imageToCanvas(new Vector(this.image.width, this.image.height));
    var cwin = this.getCanvasWindow();
    return (v.x >= cwin[0] && v.y >= cwin[2] && v.x < cwin[1] && v.y < cwin[3]);
  }

  this.addPenetrationPoint = function(m0) {
    // add to the current contour the point that's closest to the given
    // *canvas* position and on the boundary of the image window
    var m = this.canvasToImage(m0);

    // snap the point to the closest edge of the image window boundary
    // first we need to find the image window in image coordinates
    var edges = this.getImageWindow();
    var diffs = [Math.abs(edges[0] - m.x),  // left border
                 Math.abs(edges[1] - m.x),  // right border
                 Math.abs(edges[2] - m.y),  // top border
                 Math.abs(edges[3] - m.y)]; // bottom border

    // find closest border
    var border = 0;
    var dmin = diffs[0];
    var i;
    for (i = 1; i < 4; ++i) {
      if (diffs[i] < dmin) {
        border = i;
        dmin = diffs[i];
      }
    }

    // snap to it
    if (border == 0 || border == 1) {
      // snap to left or right border
      var p0 = new Vector(edges[border], m.y);
    } else if (border == 2 || border == 3) {
      // snap to top or bottom border
      var p0 = new Vector(m.x, edges[border]);
    }
    this.contour.push(p0);
  }

  this.getCanvasWindow = function() {
    // get the visible image window in canvas coordinates
    var img = this.getImageWindow()
    var v1 = this.imageToCanvas(new Vector(img[0], img[2]));
    var v2 = this.imageToCanvas(new Vector(img[1], img[3]));

    return [v1.x, v2.x, v1.y, v2.y];
  }

  this.getImageWindow = function() {
    // get the visible image window in image coordinates
    var topLeft = this.canvasToImage(new Vector(0.0, 0.0));
    var bottomRight = this.canvasToImage(new Vector(canvas.width, canvas.height));

    var minX = Math.max(0.0, topLeft.x);
    var maxX = Math.min(this.image.width, bottomRight.x);
    var minY = Math.max(0.0, topLeft.y);
    var maxY = Math.min(this.image.height, bottomRight.y);

    return [minX, maxX, minY, maxY];
  }

  this.canvasToImage = function(v) {
    // convert vector from canvas coordinates to image coordinates
    return new Vector(this.izoom.x - canvas.width/(2*this.izoom.s) + v.x/this.izoom.s,
                      this.izoom.y - canvas.height/(2*this.izoom.s) + v.y/this.izoom.s);
  }

  this.imageToCanvas = function(v) {
    // convert vector from image coordinates to canvas coordinates
    return new Vector(this.izoom.s*(v.x - this.izoom.x) + canvas.width/2,
                      this.izoom.s*(v.y - this.izoom.y) + canvas.height/2);
  }

  //// event handlers
  this.getDeltas = function(e) {
    var PIXEL_STEP = 10;
    var LINE_HEIGHT = 40;
    var PAGE_HEIGHT = 800;

    // extract amount of mouse wheel motion from event, cross-browser
    var sX = 0, sY = 0, pX = 0, pY = 0;

    if ('detail'      in e) { sY = e.detail; }
    if ('wheelDelta'  in e) { sY = -e.wheelDelta / 120; }
    if ('wheelDeltaY' in e) { sY = -e.wheelDeltaY / 120; }
    if ('wheelDeltaX' in e) { sX = -e.wheelDeltaX / 120; }

    if ('axis' in e && e.axis == e.HORIZONTAL_AXIS) {
      sX = sY;
      sY = 0;
    }

    pX = sX * PIXEL_STEP;
    pY = sY * PIXEL_STEP;

    if ('deltaY' in e) { pY = e.deltaY; }
    if ('deltaX' in e) { pX = e.deltaX; }

    if ((pX || pY) && e.deltaMode) {
      if (e.deltaMode == 1) { // delta in LINE units
        pX *= LINE_HEIGHT;
        pY *= LINE_HEIGHT;
      } else {                // delta in PAGE units
        pX *= PAGE_HEIGHT;
        pY *= PAGE_HEIGHT;
      }
    }

    if (pX && !sX) { sX = (pX < 1) ? -1 : 1; }
    if (pY && !sY) { sY = (pY < 1) ? -1 : 1; }

    return {spinX: sX, spinY: sY,
            pixelX: pX, pixelY: pY};
  }

  this.onWheel = function(e) {
    // handle mouse wheel & pinch gesture events
    if (!this.imageLoading && !this.imageError && !this.saving) {
      e.preventDefault();
      movement = this.getDeltas(e);
      if (e.ctrlKey) {
        // pinch gesture -- zoom around mouse position
        var center = this.extractMousePosition(e);
        this.setMouse(center);
        if (this.isInImage(center))
          this.doZoom(Math.exp(-movement.pixelY/200.0), center);
      } else {
        // scroll
        this.doScroll(-movement.pixelX, -movement.pixelY);
      }
      return false;
    }
  }

  this.doInvertImage = function() {
    this.invertImage = !this.invertImage;
    if (this.invertImage) this.brightenImage = false;
    if (this.invertImage) {
      document.getElementById("invertedimg").style.visibility = 'visible';
      document.getElementById("brightimg").style.visibility = 'hidden';
    } else {
      document.getElementById("invertedimg").style.visibility = 'hidden';
    }
  }

  this.doBrightenImage = function() {
    this.brightenImage = !this.brightenImage;
    if (this.brightenImage) this.invertImage = false;
    if (this.brightenImage) {
      document.getElementById("invertedimg").style.visibility = 'hidden';
      document.getElementById("brightimg").style.visibility = 'visible';
    } else {
      document.getElementById("brightimg").style.visibility = 'hidden';
    }
  }

  this.doHideSegmentation = function() {
    this.hideSegmentation = !this.hideSegmentation;
    document.getElementById("nosegments").style.visibility = this.hideSegmentation?'visible':'hidden';
  }

  this.onKeyPress = function(e) {
    // handle key presses
    if (!this.imageLoading && !this.imageError && !this.saving) {
      key = e.key || String.fromCharCode(e.keyCode);
      // handle zooming
      if (key == '=' || key == '+') {
        // zoom in
        this.doZoom(1.1);
        return false;
      } else if (key == '-') {
        // zoom out
        this.doZoom(1.0/1.1);
        return false;
      } else if (key == '0') {
        this.setInitialWindow();
        this.redraw();
        return false;
      } else if (key == '1') {
        this.doZoom(-1);
        return false;
      } else if (key == 's') {
        this.doHideSegmentation();
        this.invalidateOverlay();
        this.redraw();
        return false;
      } else if (key == 'i') {
        this.doInvertImage();
        this.invalidateOverlay();
        this.redraw();
        return false;
      } else if (key == 'b') {
        this.doBrightenImage();
        this.invalidateOverlay();
        this.redraw();
        return false;
      }
      if (this.drawMode == 'brush') {
        if (key == '[') {
          this.setBrushSize(this.brushSize - 1);
          this.updateMouseShape();
          return false;
        } else if (key == ']') {
          this.setBrushSize(this.brushSize + 1);
          this.updateMouseShape();
          return false;
        }
      }
    }
  }

  this.onKeyDown = function(e) {
    // handle arrow keys
    if (!this.imageLoading && !this.imageError && !this.saving) {
      var sx = 0;
      var sy = 0;
      var amt = 25;

      if (e.keyCode == 37) {        // left
        sx = 1.0;
      } else if (e.keyCode == 39) { // right
        sx = -1.0;
      } else if (e.keyCode == 38) { // up
        sy = 1.0;
      } else if (e.keyCode == 40) { // down
        sy = -1.0;
      } else if ((e.ctrlKey || e.metaKey) && !e.altKey && e.keyCode == 90) {
        if (!e.shiftKey) {
          // CTRL(/Command) + Z --> undo!
          e.preventDefault();
          this.doUndo();
          return false;
        } else {
          // CTRL(/Command) + SHIFT + Z --> redo!
          e.preventDefault();
          this.doRedo();
          return false;
        }
      } else if (e.keyCode == 13) {
        if (this.makingContour) {
          // finish path
          // if not dragging, remove last point
          if (!this.freehand && this.contour.length > 0)
            this.contour.pop();

          this.finishContour();
        }
        e.preventDefault();
        return false;
      } else if (e.keyCode == 27) {
        if (this.makingContour) {
          // discard path
          this.discardContour();
        }
        e.preventDefault();
        return false;
      }
      if (sx != 0 || sy != 0) {
        this.doScroll(sx*amt, sy*amt);
        e.preventDefault();
        return false;
      }
      this.finishPainting();
    }
  }

  this.onMouseDown = function(e) {
    if (this.imageLoading || this.imageError || this.saving)
      return;
    
    if (document.activeElement != canvas) {
      canvas.focus();
      return;
    }

    var m = this.extractMousePosition(e);
    this.setMouse(m);
    // start creating contour
    if (e.button == 0) { // left click
      if (this.drawMode == 'contour') {
        this.freehand = true;
        if (this.isInImage(m) && !this.makingContour) {
          // start a new contour
          this.makingContour = true;
          this.draggingOutside = false;
          this.contour = [this.canvasToImage(m)];
        }
        this.redraw();
        return false;
      } else if (this.drawMode == 'brush') {
        // store a copy of the segmentation, for undo registration
        this.beforePaint = this.scaleCropImage(this.segmentation);

        // start painting
        this.painting = true;
        var v = this.canvasToImage(this.mouse);
        var rect = this.brushPaint(v, v, this.eraserOn);
        this.redraw();

        // keep track of the rectangle we're changing
        this.brushRect = rect;
      }
    }
  }

  this.updateMouseShape = function(m) {
    if (m === undefined) m = this.mouse;
    // update mouse shape based on its position
    if (document.activeElement != canvas) {
      canvas.style.cursor = 'pointer';
      return;
    }
    if (this.saving) {
      canvas.style.cursor = 'wait';
      return;
    }
    if (this.isInImage(m)) {
      if (this.drawMode == 'brush') {
        canvas.style.cursor = 'none';
      } else {
        canvas.style.cursor = 'crosshair';
      }
    } else {
      canvas.style.cursor = 'auto';
    }
  }

  this.onMouseMoved = function(e) {
    // contour making or simply changing pointer shape
    if (this.imageLoading || this.imageError || this.saving)
      return;
    var m = this.extractMousePosition(e);
    this.setMouse(m);
    if (this.makingContour) {
      if (this.freehand) {
        if (this.isInImage(m)) {
          // if it was outside, then we need to handle the entry point
          if (this.draggingOutside) {
            this.hoverOverImage(e);
          }
          this.contour.push(this.canvasToImage(m));
        } else {
          // if it was inside, we need to handle the exit point
          if (!this.draggingOutside) {
            this.hoverOutImage(e);
          }
        }
      } else {
        if (this.contour.length > 0) {
          this.contour[this.contour.length - 1] = this.canvasToImage(m);
        }
      }
      this.redraw();
    } else {
      this.updateMouseShape(m);
    }
    if (this.drawMode == 'brush') {
      if (this.painting) {
        var rect = this.brushPaint(this.canvasToImage(this.oldMouse), this.canvasToImage(this.mouse),
                        this.eraserOn);
        this.brushRect = this.addRect(this.brushRect, rect);
      }
      this.redraw();
    }
  }

  this.onMouseUp = function(e) {
    if (this.imageLoading || this.imageError || this.saving)
      return;
    var m = this.extractMousePosition(e);
    this.setMouse(m);
    if (this.makingContour) {
      var cm = this.canvasToImage(m);

      var cthresh = this.closenessThreshold*window.devicePixelRatio/this.izoom.s;
      if (this.contour.length > 1) {
        if (vnorm(vsub(cm, this.contour[0])) < cthresh) {
          // have this equivalent to closing the contour
          this.contour.pop();
          this.finishContour();
          return false;
        }
      }
      this.contour.push(this.canvasToImage(m));
      if (this.contour.length < 2)
        this.contour.push(this.contour[0]);
      this.freehand = false;
      this.redraw();
    } else if (this.painting) {
      var rect = this.brushPaint(this.canvasToImage(this.oldMouse), this.canvasToImage(this.mouse),
                      this.eraserOn);
      this.brushRect = this.addRect(this.brushRect, rect);
      this.finishPainting();
      this.redraw();
    }
  }

  this.onMouseOut = function(e) {
    if (this.imageLoading || this.imageError || this.saving)
      return;
    // mouse exiting canvas
    if (this.makingContour && this.freehand) {
      // handle the exit point
      this.hoverOutImage(e);
      this.redraw();
    } else if (this.painting) {
      this.finishPainting();
    }
  }

  this.onMouseOver = function(e) {
    if (this.imageLoading || this.imageError || this.saving)
      return;
    // mouse entering canvas
    if (this.makingContour && this.freehand) {
      // handle the entry point
      this.hoverOverImage(e);
      this.redraw();
    }
  }

  this.hoverOutImage = function(e) {
    // mouse has gone outside image and/or canvas area
    if (!this.draggingOutside) {
      var m = this.extractMousePosition(e);
      this.setMouse(m);

      this.hoverOutPoint = m;
      if (this.drawMode == 'contour')
        this.addPenetrationPoint(m);
      this.draggingOutside = true;
    }
    if (this.painting)
      this.finishPainting();
  }

  this.findClosestEdge = function(v) {
    // find the edge closes to point v
    // left --> 0, bottom --> 1, right --> 2, top --> 3
    var edges = this.getCanvasWindow();
    var d0 = v.x - edges[0];
    var d2 = edges[1] - v.x;
    var d3 = v.y - edges[2];
    var d1 = edges[3] - v.y;

    var edge = 0;
    var d = d0;
    if (d1 < d) {
      edge = 1;
      d = d1;
    }
    if (d2 < d) {
      edge = 2;
      d = d2;
    }
    if (d3 < d) {
      edge = 3;
      d = d3;
    }

    return edge;
  }

  this.hoverOverImage = function(e) {
    // mouse has returned inside image and/or canvas area
    var m = this.extractMousePosition(e);
    this.setMouse(m);
    if (this.isInImage(m)) {
      if (this.draggingOutside) {
        // check whether we've gone around a corner
        var old_edge = this.findClosestEdge(this.hoverOutPoint);
        var new_edge = this.findClosestEdge(m);

        if (old_edge != new_edge) {
          var win = this.getCanvasWindow();
          var corners = [new Vector(win[0], win[3]),     // between left and bottom edges (0 -- 1)
                         new Vector(win[1], win[3]),     // between bottom and right edges (1 -- 2)
                         new Vector(win[1], win[2]),     // between right and top edges (2 -- 3)
                         new Vector(win[0], win[2])];    // between left and top edges (3 -- 0)
          var min_edge = old_edge;
          if ((min_edge + 1) % 4 != new_edge && (min_edge + 2) % 4 != new_edge) {
            min_edge = new_edge;
          }
          // always going around at least a single corner, since old_edge != new_edge
          this.contour.push(this.canvasToImage(corners[min_edge]));
          if (Math.abs(new_edge - old_edge) == 2) {
            // going around two corners -- do this counter clockwise-ly
            this.contour.push(this.canvasToImage(corners[(min_edge+1)%4]));
          }
        }

        if (this.drawMode == 'contour')
          this.addPenetrationPoint(m);
        this.draggingOutside = false;
      }
    }
  }


  this.draw = function() {
    // get a context
    var ctx = canvas.getContext("2d");

    // clear everything
    ctx.fillStyle = this.imageLoading?"#DDD":"#FFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // handle loading/error
    if (this.imageLoading) {
      if (this.imageError) {
        this.drawErrorMessage(ctx);
        this.imageLoading = false;
        this.noLoop();
      } else {
        this.drawLoadingMessage(ctx);
        if (this.imageLoaded) {
          var imgsize = document.getElementById('imgsize');
          imgsize.textContent = '(' + this.image.width + ' x ' + this.image.height + ')';
          this.setInitialWindow();
          this.setupSegmentation();
          this.imageLoading = false;
        }
      }
      return;
    }

    // main branch
    this.drawImage(ctx);

    if (this.contour && this.contour.length > 0) this.drawContour(ctx);

    if ((this.drawMode == 'brush') && this.isInImage(this.mouse)) {
      var imgSize = this.brushSize*this.izoom.s;

      ctx.beginPath();
      ctx.strokeStyle = '#FFF';
      ctx.lineWidth = 3.5*window.devicePixelRatio;
      ctx.arc(this.mouse.x, this.mouse.y, imgSize/2, 0, 2*Math.PI);
      ctx.stroke();

      ctx.beginPath();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1*window.devicePixelRatio;
      ctx.arc(this.mouse.x, this.mouse.y, imgSize/2, 0, 2*Math.PI);
      ctx.stroke();
    }

    if (this.saving) {
      this.drawSavingMessage(ctx);
    }

    this.noLoop();
  }

  //// drawing functions
  this.drawSavingMessage = function(ctx) {
    // draw a "saving..." message
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    var size = 50.0;
    ctx.font = "50px Arial Black";
    ctx.fillStyle = "#FFFFFF";
    
    // write the text
    var text = "saving...";
    var width = ctx.measureText(text).width;
    var tx = (canvas.width - width)/2;
    var ty = canvas.height/2;
    ctx.fillText(text, tx, ty);
  }

  this.drawErrorMessage = function(ctx) {
    // draw message showing that image couldn't be loaded
    var size = 50.0;
    ctx.font = "50px Arial Black";
    ctx.fillStyle = "#FFFFFF";
    
    // write the text
    var text = "can't access";
    var width = ctx.measureText(text).width;
    var tx = (canvas.width - width)/2;
    var ty = canvas.height/2;
    ctx.fillText(text, tx, ty);

    // draw a symbol next to the text
    var ss = size/2.8;
    var sx = tx - size;
    var sy = ty - 0.25*size;

    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 8.0;

    ctx.beginPath();
    ctx.moveTo(sx - ss, sy - ss);
    ctx.lineTo(sx + ss, sy + ss);

    ctx.moveTo(sx + ss, sy - ss);
    ctx.lineTo(sx - ss, sy + ss);

    ctx.stroke();
  }

  this.drawLoadingMessage = function(ctx) {
    // draw message showing that image is still loading
    var size = 50.0;
    ctx.font = "50px Arial Black";
    ctx.fillStyle = "#FFFFFF";
    
    // write the text
    var text = "loading";
    var width = ctx.measureText(text).width;
    var tx = (canvas.width - width)/2;
    var ty = canvas.height/2;
    ctx.fillText(text, tx, ty);

    // draw a symbol next to the text
    var sr = 0.7*size;
    var sa = 1.0;
    var sx = tx - 2*sr;
    var sy = ty - 0.25*size;
    var angle = arguments.callee.angle || 0.0;
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 12.0;

    ctx.beginPath();
    ctx.arc(sx, sy, sr, angle, angle+sa, false);
    ctx.stroke();

    arguments.callee.angle = angle + 0.3;
  }

  this.setInitialWindow = function() {
    // initially the whole image is visible

    // setup the initial image size + position
    var scale = Math.min(canvas.width/this.image.width, canvas.height/this.image.height);
    this.defaultScale = scale;

    this.izoom = {};
    this.izoom.x = this.image.width/2;
    this.izoom.y = this.image.height/2;
    this.izoom.s = scale;

    this.updateZoomDisplay();

    // set handlers for zoom level input / zoom buttons
    var s = this;
    document.getElementById("zoomlevel").addEventListener('change',
      function() {
        var value = $.trim(this.value);
        if (value[value.length - 1] == '%')
          value = value.substring(0, value.length - 1);
        var num = parseFloat(value);
        if (isNaN(num)) {
          var new_zoom = s.izoom.s;
          s.updateZoomDisplay();
        } else {
          var new_zoom = num/100.0;
          s.doZoom(new_zoom/s.izoom.s);
        }
        canvas.focus();
      }, false);

    document.getElementById("zoominbtn").addEventListener('click',
      function() {
        s.doZoom(1.1);
        canvas.focus();
      }, false);
    document.getElementById("zoomoutbtn").addEventListener('click',
      function() {
        s.doZoom(1.0/1.1);
        canvas.focus();
      }, false);

      document.getElementById("undobtn").addEventListener('click',
        function() {
          canvas.focus();
          s.doUndo();
        }, false);
      document.getElementById("redobtn").addEventListener('click',
        function() {
          canvas.focus();
          s.doRedo();
        }, false);

      this.updateUndoButtons();
  }

  this.updateZoomDisplay = function() {
    var value = Math.round(this.izoom.s*100);
    document.getElementById("zoomlevel").value = value + "%";
  }

  this.createMipmaps = function(img, n) {
    // create n mipmaps of the original image (scales 2^0, 2^1, ..., 2^{n-1})
    images = [];
    var i;
    var crt_w = img.width;
    var crt_h = img.height;
    for (i = 0; i < n; ++i) {
      // XXX might be most efficient to downsample from the smallest available
      // image instead of always using the fullsize one; though that might also
      // introduce more errors
      var crt_w_i = Math.round(crt_w);
      var crt_h_i = Math.round(crt_h);
      images.push(this.scaleCropImage(img, 0, 0, img.width, img.height, crt_w_i, crt_h_i));
      crt_w /= 2;
      crt_h /= 2;
    }

    return images;
  }

  this.drawImage = function(ctx) {
    // make sure overlay is up-to-date
    this.updateOverlay();

    // draw the image+segmentation overlay on canvas
    var canvasWindow = this.getCanvasWindow();
    var imageWindow = this.getImageWindow();
    var mipIdx = Math.max(0, Math.floor(-Math.log(this.izoom.s)/Math.LN2));
    mipIdx = Math.min(this.overlay_mipmaps.length-1, mipIdx);
    var mipFactor = Math.pow(2, mipIdx);

    var sx = Math.floor(imageWindow[0]/mipFactor);
    var sy = Math.floor(imageWindow[2]/mipFactor);
    var sw = (imageWindow[1] - imageWindow[0])/mipFactor;
    var sh = (imageWindow[3] - imageWindow[2])/mipFactor;

    var x = canvasWindow[0];
    var y = canvasWindow[2];
    var w = canvasWindow[1] - canvasWindow[0];
    var h = canvasWindow[3] - canvasWindow[2];
    ctx.drawImage(this.overlay_mipmaps[mipIdx], sx, sy, sw, sh, x, y, w, h);
  }

  this.scaleCropImage = function(img, sx, sy, sw, sh, w, h) {
    // scale and crop image onto a canvas
    // if sx, sy, sw, and sh are provided, a crop is made
    // if w and h are provided, the image is rescaled
    sx = sx || 0;
    sy = sy || 0;
    sw = Math.floor(sw) || img.width;
    sh = Math.floor(sh) || img.height;

    w = Math.floor(w) || sw;
    h = Math.floor(h) || sh;

    var tempCanvas = document.createElement('canvas');
    tempCanvas.width = w;
    tempCanvas.height = h;
    
    var tempCtx = tempCanvas.getContext("2d");
    tempCtx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);

    return tempCanvas;
  }
  
  this.createInvertedImage = function() {
    var img = this.scaleCropImage(this.image);
    var ctx = img.getContext("2d");
    var imgDataObj = ctx.getImageData(0, 0, this.image.width, this.image.height);
    var imgData = imgDataObj.data;
    var npx = this.image.width*this.image.height;
    var crt = 0;
    for (var i = 0; i < npx; ++i) {
      imgData[crt] = 255 - imgData[crt++];
      imgData[crt] = 255 - imgData[crt++];
      imgData[crt] = 255 - imgData[crt++];
      imgData[crt] = imgData[crt++];  // keep the alpha
    }

    ctx.putImageData(imgDataObj, 0, 0);

    return img;
  }

  this.createBrighterImage = function() {
    var img = this.scaleCropImage(this.image);
    var ctx = img.getContext("2d");
    var imgDataObj = ctx.getImageData(0, 0, this.image.width, this.image.height);
    var imgData = imgDataObj.data;
    var npx = this.image.width*this.image.height;
    var crt = 0;
    var brighten = function(x, amt) {
      return Math.round(255.0*Math.pow(x/255.0, amt));
    };
    var map = [];
    amt = 0.5;
    for (var i = 0; i < 256; ++i) {
      map.push(brighten(i, amt));
    }
    for (var i = 0; i < npx; ++i) {
      imgData[crt] = map[imgData[crt++]];
      imgData[crt] = map[imgData[crt++]];
      imgData[crt] = map[imgData[crt++]];
      imgData[crt] = imgData[crt++];  // keep the alpha
    }

    ctx.putImageData(imgDataObj, 0, 0);

    return img;
  }

  this.updateOverlay = function() {
    // update the overlay of image+segmentation
    if (this.overlayValid && this.invalidateAt !== undefined) {
      var date = new Date();
      if (date.getTime() >= this.invalidateAt) {
        this.invalidateOverlay();
        this.updateOverlay();
        return;
      }
    }
    if (!this.overlayValid) {
      var invX1 = this.overlayInvalidRect[0];
      var invX2 = this.overlayInvalidRect[1];
      var invY1 = this.overlayInvalidRect[2];
      var invY2 = this.overlayInvalidRect[3];

      // make sure that the window is aligned with the pixels on the maximum minifaction, to
      // avoid any artifacts
      var maxFactor = Math.pow(2, this.nMipmaps-1);
      invX1 = Math.floor(invX1/maxFactor)*maxFactor;
      invX2 = Math.ceil(invX2/maxFactor)*maxFactor;
      invY1 = Math.floor(invY1/maxFactor)*maxFactor;
      invY2 = Math.ceil(invY2/maxFactor)*maxFactor;

      if (this.invertImage) {
        if (this.invertedImage === null)
          this.invertedImage = this.createInvertedImage();
        var img = this.invertedImage;
      } else if (this.brightenImage) {
        if (this.brighterImage === null)
          this.brighterImage = this.createBrighterImage();
        var img = this.brighterImage;
      } else {
        var img = this.image;
      }

      if (invX1 <= 0 && invY1 <= 0 && invX2 >= this.image.width && invY2 >= this.image.height) {
        // everything is invalidated
        this.overlay = this.scaleCropImage(img);

        if (!this.hideSegmentation) {
          var ctx = this.overlay.getContext("2d");
          ctx.globalCompositeOperation = "lighter";
          ctx.drawImage(this.segmentation, 0, 0);
        }

        this.overlay_mipmaps = this.createMipmaps(this.overlay, this.nMipmaps);

        this.overlayValid = true;
      } else {
        // only a certain rectangle was invalidated
        var invW = invX2 - invX1;
        var invH = invY2 - invY1;
        var changed = this.scaleCropImage(img, invX1, invY1, invW, invH);

        if (!this.hideSegmentation) {
          var ctx = changed.getContext("2d");
          ctx.globalCompositeOperation = "lighter";
          ctx.drawImage(this.segmentation, invX1, invY1, invW, invH, 0, 0, invW, invH);
        }

        // create mipmaps of the changed section
        this.changed_mipmaps = this.createMipmaps(changed, this.nMipmaps);

        // update the full-size mipmaps
        var factor = 1.0;
        for (var i = 0; i < this.overlay_mipmaps.length; ++i) {
          var ctx = this.overlay_mipmaps[i].getContext("2d");
          // these should be integers anyway, but just in case there are rounding problems...
          var crtW = Math.round(invW/factor);
          var crtH = Math.round(invH/factor);
          ctx.drawImage(this.changed_mipmaps[i], 0, 0, crtW, crtH,
              invX1/factor, invY1/factor, crtW, crtH);
          factor *= 2;
        }

        this.overlayValid = true;
      }
    }
  }

  this.addRect = function(rect1, rect2) {
    // return a larger rectangle that includes both
    return [Math.min(rect1[0], rect2[0]), Math.max(rect1[1], rect2[1]),
            Math.min(rect1[2], rect2[2]), Math.max(rect1[3], rect2[3])];
  }

  this.invalidateOverlayRect = function(rect) {
    // mark only a certain portion of the overlay as invalid
    if (this.overlayValid) {
      this.overlayInvalidRect = [Math.floor(rect[0]), Math.ceil(rect[1]),
                                 Math.floor(rect[2]), Math.ceil(rect[3])];
    } else {
      var old = this.overlayInvalidRect;
      this.overlayInvalidRect = [Math.min(old[0], Math.floor(rect[0])), Math.max(old[1], Math.ceil(rect[1])),
                                 Math.min(old[2], Math.floor(rect[2])), Math.max(old[3], Math.ceil(rect[3]))];
    }

    this.overlayValid = false;
    this.invalidateAt = undefined;
  }

  this.invalidateOverlay = function(t) {
    // mark the overlay data as invalid, or force it to invalidate a time t (milliseconds) in the future
    t = t || 0;
    if (t == 0) {
      this.invalidateOverlayRect([0, this.image.width, 0, this.image.height]);
    } else {
      if (this.invalidateAt === undefined) {
        var date = new Date();
        this.invalidateAt = date.getTime() + t;
        
        var s = this;
        setTimeout(
            function() {
              if (s.invalidateAt !== undefined) {
                s.invalidateOverlay();
                s.redraw();
                s.invalidateAt = undefined;
              }
            },
          t);
      }
    }
  }

  this.drawContour = function(ctx) {
    // draw the currently selected/selecting contour
    if (this.makingContour) {
      ctx.beginPath();
      var i;
      var omit = this.freehand?0:1;
      for (i = 0; i < this.contour.length - omit; ++i) {
        var p = this.imageToCanvas(this.contour[i]);
        if (i == 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.strokeStyle = "#FFF";
      ctx.lineWidth = 2*window.devicePixelRatio;
      ctx.stroke();

      if (!this.freehand && this.contour.length >= 2) {
        ctx.beginPath();
        n = this.contour.length;
        var p1 = this.imageToCanvas(this.contour[n-2]);
        var p2 = this.imageToCanvas(this.contour[n-1]);
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.strokeStyle = "#EEE";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }

  //// moving around in the image
  this.doZoom = function(factor, center) {
    // zoom in by factor around center (in canvas coords)
    // if center not provided, use canvas center
    if (center === undefined)
      center = new Vector(canvas.width/2, canvas.height/2);

    var old_s = this.izoom.s;
    if (factor >= 0) {
      this.izoom.s *= factor;
    } else {
      // zoom in fully
      this.izoom.s = 1;
    }

    // limit zooming range
    var max_zoom = 4.0;
    var min_zoom = this.defaultScale || 0.001;
    this.izoom.s = Math.min(Math.max(this.izoom.s, min_zoom), max_zoom);

    var img_center = this.canvasToImage(center);
    var ratio = old_s/this.izoom.s;
    this.izoom.x = this.izoom.x*ratio + (1 - ratio)*img_center.x;
    this.izoom.y = this.izoom.y*ratio + (1 - ratio)*img_center.y;

    // if we're zooming out, make sure to move the image to maximize
    // canvas use
    if (factor < 1)
      this.fixPosition();

    this.updateMouseShape(center);
    this.updateZoomDisplay();
    this.redraw();
  }

  this.doScroll = function(sx, sy) {
    // scroll by (sx, sy)
    var changed = false;
    if (this.image.width*this.izoom.s > canvas.width) {
      this.izoom.x -= sx/this.izoom.s;
      changed = true;
    }
    if (this.image.height*this.izoom.s > canvas.height) {
      this.izoom.y -= sy/this.izoom.s;
      changed = true;
    }
    if (changed) {
      this.fixPosition();
      this.updateMouseShape();
      this.redraw();
    }
  }

  this.fixPosition = function() {
    // fix image position to maximize canvas used
    var fw = canvas.width;
    var fh = canvas.height;

    var v1 = this.imageToCanvas(new Vector(0, 0));
    var v2 = this.imageToCanvas(new Vector(this.image.width, this.image.height));
    if (this.image.width*this.izoom.s > canvas.width) {
      if (v2.x < canvas.width) {
        this.izoom.x -= (canvas.width - v2.x)/this.izoom.s;
      }
      if (v1.x > 0) {
        this.izoom.x += v1.x/this.izoom.s;
      }
    } else {
      this.izoom.x = this.image.width/2;
    }
    if (this.image.height*this.izoom.s > canvas.height) {
      if (v2.y < canvas.height) {
        this.izoom.y -= (canvas.height - v2.y)/this.izoom.s;
      }
      if (v1.y > 0) {
        this.izoom.y += v1.y/this.izoom.s;
      }
    } else {
      this.izoom.y = this.image.height/2;
    }
  }

  //// segmentation
  this.setupSegmentation = function() {
    // set up the segmentation buffer
    this.segmentation = document.createElement('canvas');
    this.segmentation.width = this.image.width;
    this.segmentation.height = this.image.height;

    var ctx = this.segmentation.getContext("2d");

    // clear everything
    // this may be unnecessary...
    ctx.fillStyle = "rgba(0, 0, 0, 0)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    this.invalidateOverlay();

    this.selectMode('contour', true);
  }

  this.findBoundingRect = function(contour) {
    // find the bounding rectangle of the polygon
    var min_y = contour[0].y;
    var max_y = min_y;
    var min_x = contour[0].x;
    var max_x = min_x;

    var i;
    for (i = 1; i < contour.length; ++i) {
      if (contour[i].x < min_x) min_x = contour[i].x;
      if (contour[i].x > max_x) max_x = contour[i].x;
      if (contour[i].y < min_y) min_y = contour[i].y;
      if (contour[i].y > max_y) max_y = contour[i].y;
    }

    // round these to integers
    min_x = Math.floor(min_x);
    max_x = Math.ceil(max_x);
    min_y = Math.floor(min_y);
    max_y = Math.ceil(max_y);

    return [min_x, max_x, min_y, max_y];
  }

  this.fillContour = function(ctx, contour, style) {
    // fill the contour on the given context with the given style
    // figure out the vertical bounds of the contour
    contour = this.eliminateContourDuplicates(contour);
    var rect = this.findBoundingRect(contour);
    var min_y = rect[2];
    var max_y = rect[3];

    // start filling
    if (style != 'erase')
      ctx.fillStyle = style;
    var y;
    for (y = min_y; y <= max_y; ++y) {
      // find all the intersection of the scanline with the polygon edges
      var inters = [];
      var j = contour.length - 1;
      var vi, vj = contour[j];
      for (i = 0; i < contour.length; ++i) {
        vi = contour[i];
        if (vi.y <= y && vj.y >= y || vj.y <= y && vi.y >= y)
          inters.push(vi.x + (y - vi.y)*(vj.x - vi.x)/(vj.y - vi.y));
        j = i;
        vj = vi;
      }

      // need these sorted
      inters.sort(function(a, b) { return a - b; });

      // and now fill the interior, using an even/odd strategy
      for (i = 0; i < inters.length; i += 2) {
        if (style == 'erase')
          ctx.clearRect(inters[i], y, inters[i+1]-inters[i], 1);
        else
          ctx.fillRect(inters[i], y, inters[i+1]-inters[i], 1);
      }
    }

    return rect;
  }

  this.smoothCurve = function(contour, scale, nfactor) {
    contour = this.eliminateContourDuplicates(contour);

    // smooth the given polygon on the given scale
    // generate a curve with at most nfactor*(curve length)/max_dist points
    nfactor = nfactor || 10;
    
    // smoothing function: 0.5*(1 + cos(pi/2*x/s)) for x in [-2s, 2s]
    // this vanishes at the edges, and is equal to 0.5 at x = s, 1.0 at x = 0
    var max_dist = 2*scale;

    // first transform the curve into a parametric form, with the distance
    // along the curve as the parameter
    var last_v = contour[0];

    var d = [0];
    for (var i = 1; i < contour.length; ++i) {
      var crt_v = contour[i];
      var dist = vnorm(vsub(crt_v, last_v));

      d.push(d[i-1] + dist);

      last_v = crt_v;
    }

    // calculate full length of curve
    var clen = d[d.length - 1] + vnorm(vsub(last_v, contour[0]));

    // next split the curve into buckets that can be used for adjacency calculation
    var n_buckets = Math.floor(clen/max_dist) + 1;
    var buckets = [];
    for (var i = 0; i < n_buckets; ++i) {
      buckets.push([]);
    }
    for (var i = 0; i < contour.length; ++i) {
      buckets[Math.floor(d[i] / max_dist)].push(i);
    }

    // now start smoothing
    // only interested in points within a distance max_dist
    // that means we only have to look in the adjacent buckets
    var res = [];
    var curve_dist = function(k, d2) {
      return Math.min(Math.abs(d[k] - d2),
        Math.min(Math.abs(d[k] + clen - d2), Math.abs(d2 + clen - d[k])));
    };
    // urgh! javascript modulo ('%') is negative for negative first argument!
    var real_mod = function(a, b) { return ((a%b) + b)%b; };
    var n_points = Math.ceil(nfactor*clen/max_dist);
    var d_step = clen/n_points;
    for (var d2 = 0; d2 < clen; d2 += d_step) {
      var ibucket = Math.floor(d2 / max_dist);
      var bucket = buckets[ibucket];
      var lbucket = buckets[real_mod((ibucket - 1), n_buckets)];
      var rbucket = buckets[real_mod((ibucket + 1), n_buckets)];

      var neighbors = [];
      for (var j = 0; j < bucket.length; ++j) {
        // for these the distances are always < max_dist
        neighbors.push(bucket[j]);
      }
      for (var j = 0; j < lbucket.length; ++j) {
        if (curve_dist(lbucket[j], d2) < max_dist)
          neighbors.push(lbucket[j]);
      }
      for (var j = 0; j < rbucket.length; ++j) {
        if (curve_dist(rbucket[j], d2) < max_dist)
          neighbors.push(rbucket[j]);
      }
      
      if (neighbors.length == 0) continue;

      var smoothed = new Vector(0, 0);
      var denom = 0;
      // smoothing function: 0.5*(1 + cos(pi*x/max_dist))
      for (var j = 0; j < neighbors.length; ++j) {
        var k = neighbors[j];
        var dist = curve_dist(k, d2);
        var f = 0.5*(1 + Math.cos(Math.PI*dist/max_dist));
        smoothed = vadd(smoothed, vscale(f, contour[k]));
        denom += f;
      }
      if (denom > 0)
        smoothed = vscale(1.0/denom, smoothed);

      res.push(smoothed);
    }

    return res;
  }

  this.discardContour = function() {
    // discard the current contour
    this.freehand = false;
    this.makingContour = false;

    this.contour = [];
    this.redraw();
  }

  this.eliminateContourDuplicates = function(contour) {
    if (contour.length == 0) return [];
    // eliminate repeated points from contour
    var last = contour[0];
    var res = [last];
    var THRESHOLD2 = 1e-4;
    for (var i = 1; i < contour.length; ++i) {
      var crt = contour[i];
      if (vnorm2(vsub(crt, last)) >= THRESHOLD2) {
        res.push(crt);
        last = crt;
      }
    }

    return res;
  }

  this.finishContour = function() {
    // finish the contour, add it to the segmentation
    if (this.contour.length > 1) {
      if (this.curveSmoothFactor > 0) {
        // smooth the curve -- this removes jagged edges that are particularly jarring
        // when selecting on the image when it's not full-size
        this.contour = this.smoothCurve(this.contour,
          window.devicePixelRatio*this.curveSmoothFactor/this.izoom.s);
        this.redraw();
      }

      var rect = this.findBoundingRect(this.contour);
      this.registerUndo(this.segmentation, rect);
      this.fillContour(this.segmentation.getContext("2d"), this.contour,
        ((this.eraserOn)?'erase':this.currentColor));
      this.appendRedo(this.segmentation);

      this.invalidateOverlayRect(rect);
    }

    this.discardContour();
  }

  this.finishPainting = function() {
    if (this.painting) {
      // finish brush painting
      this.registerUndo(this.beforePaint, this.brushRect, this.segmentation);
      this.painting = false;
    }
  }

  this.brushPaint = function(v1, v2, erase) {
    // make a line with the brush from v1 to v2

    erase = erase || false;

    // do this by making a contour and use fillContour, to avoid any antialiasing trouble
    var contour = [];

    // work in a coordinate system based on the line from v1 to v2
    var diff = vsub(v2, v1);
    if (vnorm2(diff) < 1e-4) {
      var vi = new Vector(1, 0);
      var vj = new Vector(0, 1);
    } else {
      var vi = vscale(1.0/vnorm(diff), diff);
      var vj = new Vector(vi.y, -vi.x);
    }

    // number of segments for each half circle
    var nseg = Math.floor(this.brushSize);

    // draw half circle around starting point
    var R = this.brushSize/2;
    var i;
    for (i = 0; i < nseg; ++i) {
      var angle = i*Math.PI/nseg;
      var vr = vadd(vscale(-R*Math.sin(angle), vi), vscale(R*Math.cos(angle), vj));
      contour.push(vadd(v1, vr));
    }

    // draw half circle around ending point
    for (i = 1; i <= nseg; ++i) {
      var angle = i*Math.PI/nseg;
      var vr = vadd(vscale(R*Math.sin(angle), vi), vscale(-R*Math.cos(angle), vj));
      contour.push(vadd(v2, vr));
    }

    var rect = this.fillContour(this.segmentation.getContext("2d"), contour, erase?'erase':this.currentColor);

    this.invalidateOverlayRect(rect);
  
    return rect;
  }

  this.selectMode = function(mode, force) {
    if (this.drawMode != mode || force) {
      this.drawMode = mode;
      this.contour = [];

      if (mode == 'brush') {
        // the size slider is the same for the brush and the eraser
        toolprops['brushbtn']['span'].style.visibility = 'visible';
        toolprops['polybtn']['span'].style.visibility = 'hidden';
        var slider = toolprops['brushbtn']['sizeslider'];
        var value = toolprops['brushbtn']['sizevalue'];
        var s = this;
        slider.addEventListener('change', function() {
            s.setBrushSize(slider.value);
          });
        value.addEventListener('change', function() {
            s.setBrushSize(value.value);
          });

        slider.min = this.minBrush;
        slider.max = this.maxBrush;
        this.setBrushSize(this.brushSize);
      } else if (mode == 'contour') {
        toolprops['polybtn']['span'].style.visibility = 'visible';
        toolprops['brushbtn']['span'].style.visibility = 'hidden';
        var slider = toolprops['polybtn']['smoothslider'];
        var value = toolprops['polybtn']['smoothvalue'];
        var s = this;
        slider.addEventListener('change', function() {
            s.setSmoothSize(slider.value);
          });
        value.addEventListener('change', function() {
            s.setSmoothSize(value.value);
          });

        slider.min = this.minSmoothFactor;
        slider.max = this.maxSmoothFactor;
        this.setSmoothSize(this.curveSmoothFactor);
      } else {
        toolprops['polybtn']['span'].style.visibility = 'hidden';
        toolprops['brushbtn']['span'].style.visibility = 'hidden';
      }

      this.updateMouseShape();
      this.redraw();
    }
  }

  this.setSmoothSize = function(size) {
    this.curveSmoothFactor = Math.max(this.minSmoothFactor, Math.min(this.maxSmoothFactor, size));

    var slider = toolprops['polybtn']['smoothslider'];
    var value = toolprops['polybtn']['smoothvalue'];
    slider.value = this.curveSmoothFactor;
    value.value = slider.value;

    canvas.focus();
  }

  this.setBrushSize = function(size) { 
    this.brushSize = Math.max(this.minBrush, Math.min(this.maxBrush, size));
    this.redraw();

    var slider = toolprops['brushbtn']['sizeslider'];
    var value = toolprops['brushbtn']['sizevalue'];
    slider.value = this.brushSize;
    value.value = slider.value;

    canvas.focus();
  }

  this.createNewTagLi = function(tag, idx, color) {
    // create the li element for a new tag
    var li = document.createElement('li');
    li.setAttribute('id', "tag" + idx);
    li.classList.add("taglist");

    var input = document.createElement('input');
    input.setAttribute('id', "tagname" + idx);
    input.setAttribute('type', "text");
    input.setAttribute('value', tag);
    input.classList.add("tag");

    var swatch = document.createElement('span');
    swatch.setAttribute('id', "swatch" + idx);
    swatch.classList.add("colorswatch");
    swatch.style.background = color;

    li.appendChild(input);
    li.appendChild(swatch);

    var s = this;
    input.addEventListener('change', function() {
        s.selectTag(parseInt(this.id.substring(7), 10));
      });
    input.addEventListener('click', function() {
        s.selectTag(parseInt(this.id.substring(7), 10));
      });
    input.addEventListener('dblclick', function() {
        s.selectTag(parseInt(this.id.substring(7), 10), false);
        this.focus();
      });
    swatch.addEventListener('click', function() {
        s.selectTag(parseInt(this.id.substring(6), 10));
      });

    return li;
  }

  this.addTag = function(tag, color) {
    // add a new tag to the list of tags
    var tag_list = document.getElementById('taglistobj');
    var tag_items = tag_list.getElementsByTagName('li');
    var n = tag_items.length;

    var new_tag = this.createNewTagLi(tag, n, color);
    
    tag_list.appendChild(new_tag);

    this.selectTag(n);
  }

  this.addNextTag = function() {
    // make a new tag, with default properties
    var tag_list = document.getElementById('taglistobj');
    var tag_items = tag_list.getElementsByTagName('li');

    var next_i = tag_items.length-1;
    if (next_i >= color_cycle.length) {
      window.alert("Oops: we're out of colors for the tags (maximum number is currently " + next_i + ").");
      return;
    }

    this.addTag(next_i>0?("object" + next_i):"foreground", color_cycle[next_i]);
  }

  this.selectTag = function(idx, focus) {
    // select a particular tag to work with
    var tag_list = document.getElementById('taglistobj');
    var tag_items = tag_list.getElementsByTagName('li');
    
    for (var i = 0; i < tag_items.length; ++i) {
      tag_items[i].classList.remove("selected");
    }

    if (idx >= 0) {
      tag_items[idx].classList.add("selected");

      this.currentColor = color_cycle[idx-1];
      this.eraserOn = false;
    }

    if (focus === undefined)
      focus = true;
    if (focus)
      canvas.focus();
  }

  this.getTagMap = function() {
    // get list of tags and corresponding colors
    map = [];
    var tag_list = document.getElementById('taglistobj');
    var tag_items = tag_list.getElementsByTagName('li');
    // skip eraser!
    for (var i = 1; i < tag_items.length; ++i) {
      var item = tag_items[i];
      var input = item.children[0];
      var swatch = item.children[1];

      var tag = input.value;
      // XXX this is a little fragile
      var color = color_cycle[i-1];

      map.push([tag, color]);
    }
    return map;
  }

  this.appendRedo = function(dest) {
    // append an "after" tag for the last undo that was registered
    var lastUndo = this.undoHistory[this.undoPointer];
    var region = lastUndo.region;
    var after = this.scaleCropImage(dest, region.x, region.y, region.w, region.h);
    
    lastUndo.after = after;
  }

  this.registerUndo = function(src, rect, dest) {
    // register an undo level corresponding to changes in the given rect
    // src is a canvas containing the "before" segmentation
    // dest, if provided, is a canvas containing the "after" segmentation
    var x1 = rect[0];
    var x2 = rect[1];
    var y1 = rect[2];
    var y2 = rect[3];

    // make sure that the window is aligned with the pixels on the maximum minifaction, to
    // avoid any artifacts
    var maxFactor = Math.pow(2, this.nMipmaps-1);
    x1 = Math.floor(x1/maxFactor)*maxFactor;
    x2 = Math.ceil(x2/maxFactor)*maxFactor;
    y1 = Math.floor(y1/maxFactor)*maxFactor;
    y2 = Math.ceil(y2/maxFactor)*maxFactor;

    var w = x2 - x1;
    var h = y2 - y1;

    var before = this.scaleCropImage(src, x1, y1, w, h);

    if (dest) {
      var after = this.scaleCropImage(dest, x1, y1, w, h);
    } else {
      var after = null;
    }

    if (this.undoPointer < this.undoHistory.length - 1) {
      // first delete all the redos
      this.undoHistory.splice(this.undoPointer+1);
    }

    this.undoHistory.push({region: {x: x1, y: y1, w: w, h: h}, before: before, after: after});
    ++this.undoPointer;

    // do we need to get rid of some undo levels?
    if (this.undoHistory.length > this.maxUndo) {
      this.undoHistory.splice(0, this.undoHistory.length - this.maxUndo);
    }

    // are we taking up too much space?
    var pxUsage = 0;
    for (var i = this.undoHistory.length - 1; i >= 0; --i) {
      var crtUndo = this.undoHistory[i];
      // twice because we have (or will have) both before and after
      pxUsage += 2*crtUndo.region.w*crtUndo.region.h;
      if (pxUsage > this.maxUndoPixels) {
        // need to delete everything up to and including the current level
        this.undoHistory.splice(0, i+1);
        break;
      }
    }
    
    this.updateUndoButtons();
  }

  this.doUndo = function() {
    if (this.undoHistory.length > 0 && this.undoPointer >= 0) {
      var crtUndo = this.undoHistory[this.undoPointer];
      var region = crtUndo.region;

      var ctx = this.segmentation.getContext("2d");
      ctx.clearRect(region.x, region.y, region.w, region.h);
      ctx.drawImage(crtUndo.before, region.x, region.y);

      --this.undoPointer;

      this.updateUndoButtons();
      this.invalidateOverlay();
//      this.invalidateOverlayRect([region.x, region.x+region.w, region.y, region.y+region.h]);
      this.redraw();
    }
  }

  this.doRedo = function() {
    if (this.undoPointer + 1 < this.undoHistory.length) {
      ++this.undoPointer;

      var crtUndo = this.undoHistory[this.undoPointer];
      var region = crtUndo.region;

      var ctx = this.segmentation.getContext("2d");
      ctx.clearRect(region.x, region.y, region.w, region.h);
      ctx.drawImage(crtUndo.after, region.x, region.y);

      this.updateUndoButtons();
      this.invalidateOverlay();
//      this.invalidateOverlayRect([region.x, region.x+region.w, region.y, region.y+region.h]);
      this.redraw();
    }
  }

  this.updateUndoButtons = function() {
    var undobtn = document.getElementById("undobtn");
    var redobtn = document.getElementById("redobtn");

    if (this.undoHistory.length == 0 || this.undoPointer < 0) {
      undobtn.classList.add('disabled');
    } else {
      undobtn.classList.remove('disabled');
    }

    if (this.undoPointer + 1 >= this.undoHistory.length) {
      redobtn.classList.add('disabled');
    } else {
      redobtn.classList.remove('disabled');
    }
  }

  this.enableEraseMode = function() {
    this.selectTag(-1);
    document.getElementById('tageraser').classList.add('selected');
    this.eraserOn = true;
  }

  this.segToList = function() {
    // convert the segmentation to a matrix of integers identifying the tags
//    var t0 = Date.now();
    var ctx = this.segmentation.getContext("2d");
    var segImData = ctx.getImageData(0, 0, this.image.width, this.image.height);
    var segData = segImData.data;

    var res = [];
    var crt = 0;

    // turn the color cycle into an associative array, for speed
    // start with #000000 -> 0
    var assoc = {0: 0};
    for (var i = 0; i < color_cycle.length; ++i) {
      var color = parseInt('0x' + color_cycle[i].slice(1))
      assoc[color] = i + 1;
    }

    var npx = this.image.width*this.image.height;
    for (var i = 0; i < npx; ++i) {
      var r = segData[crt];
      var g = segData[crt+1];
      var b = segData[crt+2];
      crt += 4;

      var color = b + (g << 8) + (r << 16);
      res.push(assoc[color] || 0);
    }

/*    var t1 = Date.now();
    document.getElementById("temp").textContent = t1 - t0;*/

    return res;
  }

  this.doRle = function(v) {
    // RLE encode the array
    // the output is an array formed by pairs (n, x), meaning
    // n elements with value x
    var res = [];

    var n = v.length;
    var i = 0;
    while (i < n) {
      var x = v[i++];
      var k = 1;
      while (i < n && v[i] == x) {
        ++k;
        ++i;
      }

      res.push(k);
      res.push(x);
    }

    return res;
  }

  //// initialization
  // figure out a good size
  var win_width = window.innerWidth;
  var win_height = window.innerHeight;
  var header_height = document.getElementById('imgtitle').getBoundingClientRect().bottom;

  var max_width = Math.max(win_width - 380, 500);
  var max_height = win_height - header_height - 80;

  // set the size of the segmenter on screen
  var px_width = Math.round(Math.min(max_width, 3*max_height/2));
  var px_height = Math.round(2*px_width/3);

  document.getElementById("segmenterdiv").style.width = px_width + "px";
  document.getElementById("segmenterctrl").style.left = px_width + "px";

  var zoom_ctrls = document.getElementById("zoomundocontrols");
  zoom_ctrls.style.left = px_width - zoom_ctrls.getBoundingClientRect().width + "px";
  
  var dev_width = toDevice(px_width), dev_height = toDevice(px_height);

  canvas.width = dev_width;
  canvas.height = dev_height;

  // resize the canvas appropriately
  canvas.style.width  = px_width  + "px";
  canvas.style.height = px_height + "px";

  // set up event handlers
  var s = this;
  // canvases can't have keyboard focus, so setting listener on document instead
  canvas.setAttribute('tabindex', 0);
  // make sure the canvas has focus
  canvas.focus();
  var keyCollector = canvas;
  keyCollector.addEventListener("keypress", function(e) { return s.onKeyPress(e); }, false);
  keyCollector.addEventListener("keydown", function(e) { return s.onKeyDown(e); }, false);
//  keyCollector.addEventListener("keyup", function(e) { return s.onKeyUp(e); }, false);

  document.addEventListener("keydown", function(e) {
    var doPrevent = false;
    if (e.keyCode == 8 || e.keyCode == 46) {
      var d = event.srcElement || event.target;
      if ((d.tagName.toUpperCase() === 'INPUT' &&
            (d.type.toUpperCase() === 'TEXT' ||
             d.type.toUpperCase() === 'PASSWORD' ||
             d.type.toUpperCase() === 'FILE' ||
             d.type.toUpperCase() === 'SEARCH' ||
             d.type.toUpperCase() === 'EMAIL' ||
             d.type.toUpperCase() === 'NUMBER' ||
             d.type.toUpperCase() === 'DATE')
          ) || d.tagName.toUpperCase() === 'TEXTAREA')
      {
        doPrevent = d.readOnly || d.disabled;
      } else {
        doPrevent = true;
      }
    }
    if (doPrevent) 
      e.preventDefault();
  });

//  document.addEventListener("click", function() { canvas.focus(); }, false);

  canvas.addEventListener("DOMMouseScroll", function(e) { return s.onWheel(e); }, false);
  canvas.addEventListener("wheel", function(e) { return s.onWheel(e); }, false);
  canvas.addEventListener("mousedown", function(e) { return s.onMouseDown(e); }, false);
  canvas.addEventListener("mouseup", function(e) { return s.onMouseUp(e); }, false);
  canvas.addEventListener("mousemove", function(e) { return s.onMouseMoved(e); }, false);
  canvas.addEventListener("mouseout", function(e) { return s.onMouseOut(e); }, false);
  canvas.addEventListener("mouseover", function(e) { return s.onMouseOver(e); }, false);
  canvas.addEventListener("dblclick", function(e) { return s.finishContour(); }, false);

/*  canvas.addEventListener("blur", function() {
      setTimeout(function() {
          if (document.activeElement != canvas)
            canvas.style.opacity = 0.5;
        }, 100);
    }, false);
  canvas.addEventListener("focus", function() { canvas.style.opacity = 1; }, false);*/
  canvas.addEventListener("blur", function() { s.updateMouseShape(); }, false);
  canvas.addEventListener("focus", function() { s.updateMouseShape(); }, false);

  // register SAVE action
  $(function() {
    $('#savebtn').click(function() {
//      var t0 = Date.now();
      s.saving = true;
      s.redraw();
      s.updateMouseShape();
      setTimeout(function() {
        if (s.saveStyle == 'png') {
          var segURL = s.segmentation.toDataURL();
        } else if (s.saveStyle == 'matlab') {
          var segMat = s.segToList();
          var segURL = JSON.stringify(segMat);
        } else if (s.saveStyle == 'matlab_rle') {
          var segMat = s.segToList();
          var segMatRle = s.doRle(segMat);
          var segURL = JSON.stringify(segMatRle);
        }
        var tagMap = s.getTagMap();
        $.ajax({
          type: 'POST',
          url: $SCRIPT_ROOT + "/save",
          data: {
            image: segURL,
            width: s.image.width,
            height: s.image.height,
            imageName: s.imagePath,
            tags: JSON.stringify(tagMap),
            style: s.saveStyle
          },
          success: function() {
            s.saving = false;
            s.redraw();
            s.updateMouseShape();
//            var t1 = Date.now();
//            document.getElementById("temp").innerText = (t1 - t0)/1000.0;
          }
        });
        canvas.focus();
      }, 1);
    });
  });

  // register settings button
  document.getElementById("segmentersettings").style.visibility = 'hidden';
  document.getElementById("settingsbtn").addEventListener("click", function() {
    var old_viz = document.getElementById("segmentersettings").style.visibility;
    document.getElementById("segmentersettings").style.visibility =
      (old_viz=='hidden')?'visible':'hidden';
  });

  // handle output format change
  $('input[type=radio][name=savetype]').change(function() {
    if (this.value == 'Matlab')
      s.saveStyle = 'matlab_rle';
    else if (this.value == 'PNG')
      s.saveStyle = 'png';
  });

  // start up the segmenter
  this.setup();
}

//// function to initialize the segmenter
function initSketch(imgName, imgPath) {
  instance = new Segmenter(canvas, imgName, imgPath);
}

//// global variables
var instance;
var canvas = document.getElementById("segmenter");
var toolbox = {};
var toolprops = {};
var color_cycle = ['#FF0000', '#0000FF', '#00FF00', '#B08000', '#FFFF00', '#FF00FF', '#00FFFF', '#FFFFFF'];
