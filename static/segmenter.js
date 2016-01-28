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

//// The Segmenter class
function Segmenter(canvas, imageName) {
  //// attributes
  this.canvas = canvas;
  this.imageName = imageName;
  this.looping = false;
  this.overlayValid = false;
  this.drawMode = 'contour';
  this.brushSize = 25.0;
  this.mouse = new Vector(0, 0);

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
        this.mouse = center;
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
      if (this.drawMode == 'brush') {
        if (key == '[') {
          this.brushSize = Math.max(1, this.brushSize - 1);
          this.updateMouseShape();
          this.redraw();
          return false;
        } else if (key == ']') {
          this.brushSize = Math.min(200, this.brushSize + 1);
          this.updateMouseShape();
          this.redraw();
          return false;
        }
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
    }
  }

  this.onMouseDown = function(e) {
    // start creating contour
    if (e.button == 0) { // left click
      if (this.drawMode == 'contour') {
        // start a new contour
        var m = this.extractMousePosition(e);
        this.mouse = m;
        if (this.isInImage(m)) {
          this.makingContour = true;
          this.draggingOutside = false;
          this.contour = [this.canvasToImage(m)];
          this.redraw();
          return false;
        }
      }
    }
  }

  this.updateMouseShape = function(m) {
    if (m === undefined) m = this.mouse;
    // update mouse shape based on its position
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
    var m = this.extractMousePosition(e);
    this.mouse = m;
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
    if (this.drawMode == 'brush')
      this.redraw();
  }

  this.onMouseUp = function(e) {
    if (this.makingContour) {
      this.finishContour();
    }
  }

  this.onMouseOut = function(e) {
    // mouse exiting canvas
    if (this.makingContour) {
      // handle the exit point
      this.hoverOutImage(e);
      this.redraw();
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
      this.mouse = m;
      if (this.drawMode == 'contour')
        this.addPenetrationPoint(m);
      this.draggingOutside = true;
    }
  }

  this.hoverOverImage = function(e) {
    // mouse has returned inside image and/or canvas area
    var m = this.extractMousePosition(e);
    this.mouse = m;
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
    ctx.fillStyle = "#EEEEEE";
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

    if (this.drawMode == 'brush') {
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
    var mipFactor = Math.pow(2, mipIdx);

    ctx.drawImage(this.overlay_mipmaps[mipIdx],
                  imageWindow[0]/mipFactor, imageWindow[2]/mipFactor,
                  (imageWindow[1] - imageWindow[0])/mipFactor, (imageWindow[3] - imageWindow[2])/mipFactor,
                  canvasWindow[0], canvasWindow[2],
                  canvasWindow[1] - canvasWindow[0], canvasWindow[3] - canvasWindow[2]);
  }

  this.scaleCropImage = function(img, sx, sy, sw, sh, w, h) {
    // scale and crop image onto a canvas
    // if sx, sy, sw, and sh are provided, a crop is made
    // if w and h are provided, the image is rescaled
    sx = sx || 0;
    sy = sy || 0;
    sw = Math.floor(sw) || img.width;
    sh = Math.floor(sh) || img.height;

    w = Math.floor(w) || img.width;
    h = Math.floor(h) || img.height;

    var tempCanvas = document.createElement('canvas');
    tempCanvas.width = w;
    tempCanvas.height = h;
    
    var tempCtx = tempCanvas.getContext("2d");
    tempCtx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);

    return tempCanvas;
  }

  this.updateOverlay = function() {
    // update the overlay of image+segmentation
    if (!this.overlayValid) {
      
      this.overlay = this.scaleCropImage(this.image);

      var ctx = this.overlay.getContext("2d");
      ctx.globalCompositeOperation = "lighter";
      ctx.drawImage(this.segmentation, 0, 0);

      this.overlay_mipmaps = this.createMipmaps(this.overlay, 8);

      this.overlayValid = true;
    }
  }

  this.invalidateOverlay = function() {
    // mark the overlay data as invalid
    this.overlayValid = false;
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
  }

  this.fillContour = function(ctx, contour, style) {
    // fill the contour on the given context with the given style
    // figure out the vertical bounds of the contour
    var min_y = contour[0].y;
    var max_y = min_y;

    var i;
    for (i = 1; i < contour.length; ++i) {
      if (contour[i].y < min_y) min_y = contour[i].y;
      if (contour[i].y > max_y) max_y = contour[i].y;
    }

    // round these to integers
    min_y = Math.floor(min_y);
    max_y = Math.ceil(max_y);

    // start filling
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
        ctx.fillRect(inters[i], y, inters[i+1]-inters[i], 1);
      }
    }
  }

  this.finishContour = function() {
    this.makingContour = false;
    if (this.contour.length > 1) {
      var style = "#FF0000";
      this.fillContour(this.segmentation.getContext("2d"), this.contour, style);
    }

    this.contour = [];
    this.drawMode = 'brush';
    this.updateMouseShape();
    this.invalidateOverlay();
    this.redraw();
  }

  //// initialization
  // set the size of the segmenter on screen
  var px_width = 900, px_height = 500;
  var dev_width = toDevice(px_width), dev_height = toDevice(px_height);

  canvas.width = dev_width;
  canvas.height = dev_height;

  // resize the canvas appropriately
  canvas.style.width  = px_width  + "px";
  canvas.style.height = px_height + "px";

  // set up event handlers
  var s = this;
  // canvases can't have keyboard focus, so setting listener on document instead
  document.addEventListener("keypress", function(e) { return s.onKeyPress(e); }, false);
  document.addEventListener("keydown", function(e) { return s.onKeyDown(e); }, false);

  canvas.addEventListener("wheel", function(e) { return s.onWheel(e); }, false);
  canvas.addEventListener("mousedown", function(e) { return s.onMouseDown(e); }, false);
  canvas.addEventListener("mouseup", function(e) { return s.onMouseUp(e); }, false);
  canvas.addEventListener("mousemove", function(e) { return s.onMouseMoved(e); }, false);
  canvas.addEventListener("mouseout", function(e) { return s.onMouseOut(e); }, false);
  canvas.addEventListener("mouseover", function(e) { return s.onMouseOver(e); }, false);

  // make sure the canvas has focus
  canvas.focus();

  // start up the segmenter
  this.setup();
}

//// function to initialize the segmenter
function initSketch(imgName) {
  instance = new Segmenter(canvas, imgName);
}

//// global variables
var canvas = document.getElementById("segmenter");
