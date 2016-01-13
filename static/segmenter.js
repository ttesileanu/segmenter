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
  this.mouse = new Vector(0.0, 0.0);

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

  this.isInImage = function(v) {
    if (!this.iwin) return false;
    // check whether a particular point on the canvas is within the image extents
    return (v.x >= this.iwin.x && v.y >= this.iwin.y &&
            v.x < this.iwin.x + this.iwin.w && v.y < this.iwin.y + this.iwin.h);
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
    return new Vector((v.x - this.iwin.x)*this.image.width/ this.iwin.w,
                      (v.y - this.iwin.y)*this.image.height/this.iwin.h);
  }

  this.imageToCanvas = function(v) {
    // convert vector from image coordinates to canvas coordinates
    return new Vector(this.iwin.x + v.x*this.iwin.w/this.image.width,
                      this.iwin.y + v.y*this.iwin.h/this.image.height);
  }

  //// event handlers
  this.onWheel = function(e) {
    // handle mouse wheel & pinch gesture events
    if (!this.imageLoading && !this.imageError) {
      e.preventDefault();
      if (e.ctrlKey) {
        // pinch gesture -- zoom around mouse position
        var center = this.extractMousePosition(e);
        if (this.isInImage(center))
          this.doZoom(Math.exp(e.wheelDelta/2000.0), center);
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
    }
  }

  this.onMouseDown = function(e) {
    // start creating contour
    if (e.button == 0) { // left click
      // start a new contour
      var m = this.extractMousePosition(e);
      if (this.isInImage(m)) {
        this.makingContour = true;
        this.draggingOutside = false;
        this.contour = [this.canvasToImage(m)];
        this.redraw();
        return false;
      }
    }
  }

  this.onMouseMoved = function(e) {
    // contour making or simply changing pointer shape
    var m = this.extractMousePosition(e);
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
      if (this.isInImage(m)) {
        canvas.style.cursor = 'crosshair';
      } else {
        canvas.style.cursor = 'auto';
      }
    }
  }

  this.onMouseUp = function(e) {
    if (this.makingContour) {
      this.makingContour = false;
      if (this.contour.length > 1)
        this.contour.push(this.contour[0]);
      else
        this.contour = [];

      this.redraw();
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
      this.addPenetrationPoint(m);
      this.draggingOutside = true;
    }
  }

  this.hoverOverImage = function(e) {
    // mouse has returned inside image and/or canvas area
    var m = this.extractMousePosition(e);
    if (this.isInImage(m)) {
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
    // setup the initial image size + position
    var scale = Math.min(canvas.width/this.image.width, canvas.height/this.image.height);

    this.iwin = {};
    this.iwin.w = this.image.width*scale;
    this.iwin.h = this.image.height*scale;

    this.iwin.x = (canvas.width - this.iwin.w)/2;
    this.iwin.y = (canvas.height - this.iwin.h)/2;
  }

  this.drawImage = function(ctx) {
    // draw the image on canvas
    ctx.drawImage(this.image, this.iwin.x, this.iwin.y, this.iwin.w, this.iwin.h);

    // overlay the segmentation buffer
/*    ctx.drawImage(this.segmentation, 0, 0, this.iwin.w, this.iwin.h,
                  this.iwin.x, this.iwin.y, this.iwin.w, this.iwin.h);*/
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

    if (factor >= 0) {
      this.iwin.x += (1 - factor)*(center.x - this.iwin.x);
      this.iwin.y += (1 - factor)*(center.y - this.iwin.y);

      this.iwin.w *= factor;
      this.iwin.h *= factor;
    } else {
      // zoom in fully
      var img_cx = (center.x - this.iwin.x)*this.image.width/ this.iwin.w;
      var img_cy = (center.y - this.iwin.y)*this.image.height/this.iwin.h;

      this.iwin.w = this.image.width;
      this.iwin.h = this.image.height;

      this.iwin.x = canvas.width/2.0  - img_cx;
      this.iwin.y = canvas.height/2.0 - img_cy;
    }

    // if we're zooming out, make sure to move the image to maximize
    // canvas use
    if (factor < 1)
      this.fixPosition();

    this.redraw();
  }

  this.doScroll = function(sx, sy) {
    // scroll by (sx, sy)
    var changed = false;
    if (this.iwin.w > canvas.width) {
      this.iwin.x += sx;
      changed = true;
    }
    if (this.iwin.h > canvas.height) {
      this.iwin.y += sy;
      changed = true;
    }
    if (changed) {
      this.fixPosition();
      this.redraw();
    }
  }

  this.fixPosition = function() {
    // fix image position to maximize canvas used
    var fw = canvas.width;
    var fh = canvas.height;

    if (this.iwin.w > canvas.width) {
      if (this.iwin.x + this.iwin.w < canvas.width) {
        this.iwin.x = canvas.width - this.iwin.w;
      }
      if (this.iwin.x > 0) this.iwin.x = 0;
    }
    if (this.iwin.h > canvas.height) {
      if (this.iwin.y + this.iwin.h < canvas.height) {
        this.iwin.y = canvas.height - this.iwin.h;
      }
      if (this.iwin.y > 0) this.iwin.y = 0;
    }
  }

  //// segmentation
  this.setupSegmentation = function() {
    // set up the segmentation buffer
    this.segmentation = document.createElement('canvas');
    this.segmentation.width = this.image.width;
    this.segmentation.height = this.image.height;
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
  document.addEventListener("keypress",
    function(e) {
      return s.onKeyPress(e);
    }, false);
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
