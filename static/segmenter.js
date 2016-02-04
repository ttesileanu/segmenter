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
    } else if (btn.id == 'erasebtn') {
      instance.selectMode('eraser');
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

  //// member functions
  //// setup and flow control
  this.setup = function() {
    this.imageLoading = true;
    this.imageLoaded = false;
    this.imageError = false;

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
    registerToolById('erasebtn', {
        'sizeslider': document.getElementById('brushslider'),
        'sizevalue': document.getElementById('brushsize'),
        'span': document.getElementById('brushctrl')
      });
    registerToolById('polybtn');
    selectTool(toolbox['polybtn']);

    // add click event for tag adding
    document.getElementById('plustag').addEventListener('click', function() {
        s.addNextTag();
      });

    // add the first tag
    s.addNextTag();

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

  this.extractMousePosition = function(e) {
    // extract mouse position from event
    var rect = canvas.getBoundingClientRect();
    return new Vector(toDevice(e.clientX - rect.left), toDevice(e.clientY - rect.top));
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
    edges = this.getImageWindow();
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
  this.onWheel = function(e) {
    // handle mouse wheel & pinch gesture events
    if (!this.imageLoading && !this.imageError) {
      e.preventDefault();
      if (e.ctrlKey) {
        // pinch gesture -- zoom around mouse position
        var center = this.extractMousePosition(e);
        this.setMouse(center);
        if (this.isInImage(center))
          this.doZoom(Math.exp(e.wheelDelta/4000.0), center);
      } else {
        // scroll
        this.doScroll(e.wheelDeltaX, e.wheelDeltaY);
      }
      return false;
    }
  }

  this.onKeyPress = function(e) {
    // handle key presses
    if (!this.imageLoading && !this.imageError) {
      key = String.fromCharCode(e.keyCode);
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
      }
      if (this.drawMode == 'brush' || this.drawMode == 'eraser') {
        if (key == '[') {
          this.setBrushSize(this.brushSize - 1);
          this.updateMouseShape();
          return false;
        } else if (key == ']') {
          this.setBrushSize(this.brushSize + 1);
          this.updateMouseShape();
          return false;
        }/* else if (key == 'x') {
          this.invalidateOverlay();
          this.redraw();
          return false;
        }*/
      }
    }
  }

  this.onKeyDown = function(e) {
    // handle arrow keys
    if (!this.imageLoading && !this.imageError) {
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
      }
      if (sx != 0 || sy != 0) {
        this.doScroll(sx*amt, sy*amt);
        return false;
      }
      this.painting = false;
    }
  }

  this.onMouseDown = function(e) {
    if (document.activeElement != canvas) {
      canvas.focus();
      return;
    }

    var m = this.extractMousePosition(e);
    this.setMouse(m);
    // start creating contour
    if (e.button == 0) { // left click
      if (this.drawMode == 'contour') {
        // start a new contour
        if (this.isInImage(m)) {
          this.makingContour = true;
          this.draggingOutside = false;
          this.contour = [this.canvasToImage(m)];
          this.redraw();
          return false;
        }
      } else if (this.drawMode == 'brush' || this.drawMode == 'eraser') {
        // start painting
        this.painting = true;
        var v = this.canvasToImage(this.mouse);
        this.brushPaint(v, v, this.drawMode == 'eraser');
        this.redraw();
      }
    }
  }

  this.updateMouseShape = function(m) {
    if (m === undefined) m = this.mouse;
    // update mouse shape based on its position
    if (this.isInImage(m)) {
      if (this.drawMode == 'brush' || this.drawMode == 'eraser') {
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
    var m = this.extractMousePosition(e);
    this.setMouse(m);
    if (this.makingContour) {
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
      this.redraw();
    } else {
      this.updateMouseShape(m);
    }
    if (this.drawMode == 'brush' || this.drawMode == 'eraser') {
      if (this.painting)
        this.brushPaint(this.canvasToImage(this.oldMouse), this.canvasToImage(this.mouse),
                        this.drawMode == 'eraser');
      this.redraw();
    }
  }

  this.onMouseUp = function(e) {
    var m = this.extractMousePosition(e);
    this.setMouse(m);
    if (this.makingContour) {
      this.finishContour();
    } else if (this.painting) {
      this.brushPaint(this.canvasToImage(this.oldMouse), this.canvasToImage(this.mouse),
                      this.drawMode == 'eraser');
      this.painting = false;
      this.redraw();
    }
  }

  this.onMouseOut = function(e) {
    // mouse exiting canvas
    if (this.makingContour) {
      // handle the exit point
      this.hoverOutImage(e);
      this.redraw();
    } else if (this.painting) {
      this.painting = false;
    }
  }

  this.onMouseOver = function(e) {
    // mouse entering canvas
    if (this.makingContour) {
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
      if (this.drawMode == 'contour')
        this.addPenetrationPoint(m);
      this.draggingOutside = true;
    }
    if (this.painting)
      this.painting = false;
  }

  this.hoverOverImage = function(e) {
    // mouse has returned inside image and/or canvas area
    var m = this.extractMousePosition(e);
    this.setMouse(m);
    if (this.isInImage(m)) {
      if (this.drawMode == 'contour')
        this.addPenetrationPoint(m);
      this.draggingOutside = false;
    }
  }


  this.draw = function() {
    // get a context
    var ctx = canvas.getContext("2d");

    // clear everything
    ctx.fillStyle = "#FFFFFF";
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

    if ((this.drawMode == 'brush' || this.drawMode == 'eraser') && this.isInImage(this.mouse)) {
      var imgSize = this.brushSize*this.izoom.s;

      ctx.beginPath();
      ctx.strokeStyle = '#FFF';
      ctx.lineWidth = 3;
      ctx.arc(this.mouse.x, this.mouse.y, imgSize/2, 0, 2*Math.PI);
      ctx.stroke();

      ctx.beginPath();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.arc(this.mouse.x, this.mouse.y, imgSize/2, 0, 2*Math.PI);
      ctx.stroke();
    }

    this.noLoop();
  }

  //// drawing functions
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

  this.updateOverlay = function() {
    // update the overlay of image+segmentation
    if (this.overlayValid && this.invalidateAt !== undefined) {
      var date = new Date();
      if (date.getTime() >= this.invalidateAt) {
        this.invalidateOverlay();
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

      if (invX1 <= 0 && invY1 <= 0 && invX2 >= this.image.width && invY2 >= this.image.height) {
        // everything is invalidated
        this.overlay = this.scaleCropImage(this.image);

        var ctx = this.overlay.getContext("2d");
        ctx.globalCompositeOperation = "lighter";
        ctx.drawImage(this.segmentation, 0, 0);

        this.overlay_mipmaps = this.createMipmaps(this.overlay, this.nMipmaps);

        this.overlayValid = true;
      } else {
        // only a certain rectangle was invalidated
        var invW = invX2 - invX1;
        var invH = invY2 - invY1;
        var changed = this.scaleCropImage(this.image, invX1, invY1, invW, invH);

        var ctx = changed.getContext("2d");
        ctx.globalCompositeOperation = "lighter";
        ctx.drawImage(this.segmentation, invX1, invY1, invW, invH, 0, 0, invW, invH);

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
    ctx.beginPath();
    var i;
    for (i = 0; i < this.contour.length; ++i) {
      var p = this.imageToCanvas(this.contour[i]);
      if (i == 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.strokeStyle = "#FFF";
    ctx.lineWidth = 3;
    if (this.makingContour) {
      ctx.stroke();
    } else {
      ctx.fillStyle = "rgba(128, 32, 32, 0.25)";
      ctx.fill();
      ctx.stroke();
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
  }

  this.fillContour = function(ctx, contour, style) {
    // fill the contour on the given context with the given style
    // figure out the vertical bounds of the contour
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
    min_y = Math.floor(min_y);
    max_y = Math.ceil(max_y);

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
        if (vi.y < y && vj.y >= y || vj.y < y && vi.y >= y)
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

    return [min_x, max_x, min_y, max_y];
  }

  this.finishContour = function() {
    // finish the contour, add it to the segmentation
    this.makingContour = false;
    if (this.contour.length > 1) {
      var rect = this.fillContour(this.segmentation.getContext("2d"), this.contour, this.currentColor);

      this.invalidateOverlayRect(rect);
    }

    this.contour = [];
    this.redraw();
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
    for (i = 0; i < nseg; ++i) {
      var angle = i*Math.PI/nseg;
      var vr = vadd(vscale(R*Math.sin(angle), vi), vscale(-R*Math.cos(angle), vj));
      contour.push(vadd(v2, vr));
    }

    var rect = this.fillContour(this.segmentation.getContext("2d"), contour, erase?'erase':this.currentColor);

    this.invalidateOverlayRect(rect);

    // need to recalculate the overlay, but we don't want to slow things down by doing it too often
//    this.invalidateOverlay(50);
  }

  this.selectMode = function(mode) {
    if (this.drawMode != mode) {
      this.drawMode = mode;
      this.contour = [];

      if (mode == 'brush' || mode == 'eraser') {
        // the size slider is the same for the brush and the eraser
        toolprops['brushbtn']['span'].style.visibility = 'visible';
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
      } else {
        toolprops['brushbtn']['span'].style.visibility = 'hidden';
      }

      this.updateMouseShape();
      this.redraw();
    }
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
    input.addEventListener('focus', function() {
        s.selectTag(parseInt(this.id.substring(7), 10));
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

    var next_i = tag_items.length;
    if (next_i >= color_cycle.length) {
      window.alert("Oops: we're out of colors for the tags (maximum number is currently " + next_i + ").");
      return;
    }

    this.addTag(next_i>0?("object" + next_i):"foreground", color_cycle[next_i]);
  }

  this.selectTag = function(idx) {
    // select a particular tag to work with
    var tag_list = document.getElementById('taglistobj');
    var tag_items = tag_list.getElementsByTagName('li');
    
    for (var i = 0; i < tag_items.length; ++i) {
      tag_items[i].classList.remove("selected");
    }

    tag_items[idx].classList.add("selected");

    this.currentColor = color_cycle[idx];
    canvas.focus();
  }

  this.getTagMap = function() {
    // get list of tags and corresponding colors
    map = [];
    var tag_list = document.getElementById('taglistobj');
    var tag_items = tag_list.getElementsByTagName('li');
    for (var i = 0; i < tag_items.length; ++i) {
      var item = tag_items[i];
      var input = item.children[0];
      var swatch = item.children[1];

      var tag = input.value;
      // XXX this is a little fragile
      var color = color_cycle[i];

      map.push([tag, color]);
    }
    return map;
  }

  //// initialization
  // figure out a good size
  var win_width = window.innerWidth;
  var win_height = window.innerHeight;
  var header_height = document.getElementById('imgtitle').getBoundingClientRect().bottom;

  var max_width = Math.max(win_width - 380, 500);
  var max_height = win_height - header_height - 80;

  // set the size of the segmenter on screen
  var px_width = Math.min(max_width, 3*max_height/2);
  var px_height = 2*px_width/3;

  document.getElementById("segmenterdiv").style.width = px_width + "px";
  document.getElementById("segmenterctrl").style.left = px_width + "px";
  
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

  canvas.addEventListener("wheel", function(e) { return s.onWheel(e); }, false);
  canvas.addEventListener("mousedown", function(e) { return s.onMouseDown(e); }, false);
  canvas.addEventListener("mouseup", function(e) { return s.onMouseUp(e); }, false);
  canvas.addEventListener("mousemove", function(e) { return s.onMouseMoved(e); }, false);
  canvas.addEventListener("mouseout", function(e) { return s.onMouseOut(e); }, false);
  canvas.addEventListener("mouseover", function(e) { return s.onMouseOver(e); }, false);

  canvas.addEventListener("blur", function() {
      setTimeout(function() {
          if (document.activeElement != canvas)
            canvas.style.opacity = 0.5;
        }, 100);
    }, false);
  canvas.addEventListener("focus", function() { canvas.style.opacity = 1; }, false);

  // register SAVE action
  $(function() {
    $('#savebtn').click(function() {
      // XXX make sure that the segmentation is up to date
      var segURL = s.segmentation.toDataURL();
      var tagMap = s.getTagMap();
      $.ajax({
        type: 'POST',
        url: $SCRIPT_ROOT + "/save",
        data: {
          image: segURL,
          imageName: s.imagePath,
          tags: JSON.stringify(tagMap)
        }
/*        data: {
          imgBase64: segURL
        }*/
        // XXX add a success handler that shows that changes were saved
      });
      canvas.focus();
    });
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
var color_cycle = ['#FF0000', '#0000FF', '#00FF00', '#FFA000', '#BBBB22', '#FF00FF', '#00FFFF', '#FFFFFF',
                   '#000000'];
