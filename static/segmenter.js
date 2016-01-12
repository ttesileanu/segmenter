//// code for the Processing sketch
function sketchProc(processing) {
  // set the size of the sketch
  var px_width = 900, px_height = 500;
  var dev_width = toDevice(px_width), dev_height = toDevice(px_height);

  processing.size(dev_width, dev_height);

  // resize the canvas appropriately
  canvas.style.width  = px_width  + "px";
  canvas.style.height = px_height + "px";

  // make sure the canvas has focus
  canvas.focus();

  processing.setup = function() {
    // setting up the Processing sketch
    image = processing.requestImage(imageName);

    // set up an error handler
    image.sourceImg.onerror = function() {
        processing.loadError = true;
      };
    processing.loadError = false;
    processing.loading = true;

    canvas.addEventListener("wheel", processing.handleWheel, false);
  }

  //// handle mouse events
  processing.mousePressed = function() {
    // handle mouse clicks
    if (processing.mouseButton == processing.LEFT) {
      // start a new contour
      var mx = toDevice(processing.mouseX), my = toDevice(processing.mouseY);
      if (processing.isInImage(mx, my)) {
        processing.makingContour = true;
        processing.draggingOutside = false;
        var m_start = new PVector(mx, my);
        contour = [processing.canvasToImage(m_start)];
        processing.redraw();
        return false;
      }
    }
  }

  processing.mouseDragged = function() {
    // handle mouse movement when some buttons is pressed
    if (processing.mouseButton == processing.LEFT && processing.makingContour) {
      var mx = toDevice(processing.mouseX), my = toDevice(processing.mouseY);
      var m = new PVector(mx, my);
      if (processing.isInImage(mx, my)) {
        if (processing.draggingOutside) {
          processing.hoverOverImage();
        }
        contour.push(processing.canvasToImage(m));
      } else {
        if (!processing.draggingOutside) {
          processing.hoverOutImage();
        }
      }
      processing.redraw();
      return false;
    }
  }

  processing.mouseOut = function() {
    // mouse exiting canvas
    if (processing.mouseButton == processing.LEFT && processing.makingContour) {
      processing.hoverOutImage();
      processing.redraw();
    }
  }

  processing.mouseOver = function() {
    // mouse entering canvas
    if (processing.mouseButton == processing.LEFT && processing.makingContour) {
      processing.hoverOverImage();
      processing.redraw();
    }
  }

  processing.addPenetrationPoint = function() {
    // add to the current contour the point that's closest to the current
    // mouse position and on the boundary of the image window
    var mx = toDevice(processing.mouseX), my = toDevice(processing.mouseY);
    var m = processing.canvasToImage(new PVector(mx, my));

    contour.push(processing.snapToBoundary(m));
  }

  processing.hoverOutImage = function() {
    // mouse has gone outside image and/or canvas area
    processing.addPenetrationPoint();
    processing.draggingOutside = true;
  }

  processing.hoverOverImage = function() {
    // mouse has returned inside image and/or canvas area
    processing.addPenetrationPoint();
    processing.draggingOutside = false;
  }

  processing.mouseReleased = function() {
    if (processing.makingContour) {
      processing.makingContour = false;
      if (contour.length > 1)
        contour.push(contour[0]);
      else
        contour = [];

      processing.redraw();
    }
  }

  processing.mouseMoved = function() {
    // handle mouse movement when no buttons are pressed
    processing.updateMouseShape();
  }

  processing.handleWheel = function(e) {
    // handle mouse wheel & pinch gesture events
    if (!processing.loading && !processing.loadError) {
      e.preventDefault();
      if (e.ctrlKey) {
        // pinch gesture -- zoom around mouse position
        var cx = toDevice(processing.mouseX);
        var cy = toDevice(processing.mouseY);
        if (processing.isInImage(cx, cy))
          processing.doZoom(Math.exp(e.wheelDelta/2000.0), cx, cy);
      } else {
        // scroll
        processing.doScroll(e.wheelDeltaX, e.wheelDeltaY);
      }
      return false;
    }
  }

  //// handle keyboard events
  processing.keyPressed = function() {
    // handle key presses
    if (!processing.loading && !processing.loadError) {
      // handle zooming
      if (processing.key == '='.charCodeAt(0) || processing.key == '+'.charCodeAt(0)) {
        // zoom in
        processing.doZoom(1.1);
        return false;
      } else if (processing.key == '-'.charCodeAt(0)) {
        // zoom out
        processing.doZoom(0.9);
        return false;
      } else if (processing.key == '0'.charCodeAt(0)) {
        // go to default position&zoom
        processing.setInitialWindow();
        processing.redraw();
        return false;
      } else if (processing.key == '1'.charCodeAt(0)) {
        // zoom in fully, on center of window
        processing.doZoom(-1);
        return false;
      }
    }
  }

  //// main draw loop
  processing.draw = function() {
    // the main drawing loop
    // start by clearing everything
    processing.background(224);

    // handle exceptions
    if (processing.loading) {
      if (processing.loadError) {
        processing.drawErrorMessage();
        processing.loading = false;
        processing.noLoop();
      } else {
        processing.drawLoadingMessage();
        if (processing.checkLoaded()) {
          processing.setInitialWindow();
          processing.loading = false;
        }
      }
      return;
    }

    // set this to true throughout the draw event to continue looping
    var keep_loop = false;

    // main branch
    processing.drawImage();

    if (contour.length > 0)
      processing.drawContour();

    if (!keep_loop) processing.noLoop();
  }

  //// drawing functions
  processing.drawErrorMessage = function() {
    // draw message showing that image couldn't be loaded
    // set up font
    var size = 50.0;
    processing.fill(255);
    processing.textAlign(processing.CENTER, processing.CENTER);
    processing.textSize(size);

    // write the text
    var text = "can't access";
    var width = processing.textWidth(text);
    var tx = processing.width/2;
    var ty = processing.height/2;
    processing.text(text, tx, ty);

    // draw a symbol next to the text
    processing.noFill();
    processing.stroke(255);
    processing.strokeWeight(8.0);

    var sx = tx - width/2 - size;
    var sy = ty;
    var ss = size/2.8;

    // a cross
    processing.line(sx-ss, sy-ss, sx+ss, sy+ss);
    processing.line(sx+ss, sy-ss, sx-ss, sy+ss);
  }

  processing.drawLoadingMessage = function() {
    // draw message showing that image is still loading
    // set up font
    var size = 50.0;
    processing.fill(255);
    processing.textAlign(processing.CENTER, processing.CENTER);
    processing.textSize(size);

    // write the text
    var text = "loading";
    var width = processing.textWidth(text);
    var tx = processing.width/2;
    var ty = processing.height/2;
    processing.text(text, tx, ty);

    // draw a symbol next to the text
    processing.noFill();
    processing.stroke(255);
    processing.strokeWeight(8.0);

    var sa = 1.0;
    var sx = tx - width/2 - size;
    var sy = ty;

    // a moving arc
    var angle = arguments.callee.angle || 0.0;
    processing.ellipseMode(processing.CENTER);
    processing.arc(sx, sy, size, size, angle, angle + sa);

    arguments.callee.angle = angle + 0.3;
  }

  processing.drawImage = function() {
    // draw the image on the canvas
    processing.image(image, imgWindow.x, imgWindow.y, imgWindow.w, imgWindow.h);
  }
  
  processing.setInitialWindow = function() {
    // set the initial position and size of the image
    var scale = Math.min(processing.width/image.width, processing.height/image.height);
    imgWindow.w = image.width*scale;
    imgWindow.h = image.height*scale;

    imgWindow.x = (processing.width - imgWindow.w)/2;
    imgWindow.y = (processing.height - imgWindow.h)/2;
  }

  processing.drawContour = function() {
    // draw the currently selected/selecting contour
    if (processing.makingContour)
      processing.noFill();
    else
      processing.fill(128, 32, 32, 64);

    processing.stroke(255);
    processing.strokeWeight(3);

    processing.beginShape();
    var i;
    for (i = 0; i < contour.length; ++i) {
      var p = processing.imageToCanvas(contour[i]);
      processing.vertex(p.x, p.y);
    }
    processing.endShape();
  }

  //// event handling
  processing.checkLoaded = function() {
    // check whether the image was loaded
    return (image.width > 0 && image.height > 0);
  }

  processing.updateMouseShape = function() {
    // keep an appropriate shape for the mouse cursor
    var mx = toDevice(processing.mouseX);
    var my = toDevice(processing.mouseY);
    if (processing.isInImage(mx, my)) {
      processing.cursor(processing.CROSS);
    } else {
      processing.cursor(processing.ARROW);
    }
  }

  processing.isInImage = function(x, y) {
    // check whether a particular point on the canvas is within the image extents
    return (x >= imgWindow.x && y >= imgWindow.y &&
            x < imgWindow.x + imgWindow.w && y < imgWindow.y + imgWindow.h);
  }

  processing.doZoom = function(factor, cx, cy) {
    // zoom in by factor around (cx, cy) (canvas coords)
    // if center not provided, use canvas center
    if (cx === undefined) cx = processing.width/2;
    if (cy === undefined) cy = processing.height/2;

    if (factor >= 0) {
      imgWindow.x += (1 - factor)*(cx - imgWindow.x);
      imgWindow.y += (1 - factor)*(cy - imgWindow.y);

      imgWindow.w *= factor;
      imgWindow.h *= factor;
    } else {
      // zoom in fully
      var img_cx = (cx - imgWindow.x)*image.width/ imgWindow.w;
      var img_cy = (cy - imgWindow.y)*image.height/imgWindow.h;

      imgWindow.w = image.width;
      imgWindow.h = image.height;

      imgWindow.x = processing.width/2.0  - img_cx;
      imgWindow.y = processing.height/2.0 - img_cy;
    }

    // if we're zooming out, make sure to move the image to maximize
    // canvas use
    if (factor < 1)
      processing.fixPosition();

    processing.redraw();
  }

  processing.doScroll = function(sx, sy) {
    // scroll by (sx, sy)
    var changed = false;
    if (imgWindow.w > processing.width) {
      imgWindow.x += sx;
      changed = true;
    }
    if (imgWindow.h > processing.height) {
      imgWindow.y += sy;
      changed = true;
    }
    if (changed) {
      processing.fixPosition();
      processing.redraw();
    }
  }

  processing.fixPosition = function() {
    // fix image position to maximize canvas used
    var fw = processing.width;
    var fh = processing.height;

    if (imgWindow.w > processing.width) {
      if (imgWindow.x + imgWindow.w < processing.width) {
        imgWindow.x = processing.width - imgWindow.w;
      }
      if (imgWindow.x > 0) imgWindow.x = 0;
    }
    if (imgWindow.h > processing.height) {
      if (imgWindow.y + imgWindow.h < processing.height) {
        imgWindow.y = processing.height - imgWindow.h;
      }
      if (imgWindow.y > 0) imgWindow.y = 0;
    }
  }

  processing.getImageWindow = function() {
    // get the visible image window in image coordinates
    var topLeft = processing.canvasToImage(new PVector(0.0, 0.0));
    var bottomRight = processing.canvasToImage(new PVector(processing.width,
                                                           processing.height));

    var minX = Math.max(0.0, topLeft.x);
    var maxX = Math.min(image.width, bottomRight.x);
    var minY = Math.max(0.0, topLeft.y);
    var maxY = Math.min(image.height, bottomRight.y);

    return [minX, maxX, minY, maxY];
  }

  processing.snapToBoundary = function(m) {
    // snap the point to the closest edge of the image window boundary
    // first we need to find the image window in image coordinates
    edges = processing.getImageWindow();
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
      return new PVector(edges[border], m.y);
    } else if (border == 2 || border == 3) {
      // snap to top or bottom border
      return new PVector(m.x, edges[border]);
    }
  }

/*  processing.intersectImageBoundary = function(pm, m) {
    // find the point where the line oriented (pm, m) intersects the image boundary
    var dx = m.x - pm.x;
    var dy = m.y - pm.y;
    
    var pvert = undefined, phoriz = undefined;

    // find the intersection with the vertical boundaries
    if (Math.abs(dx) > 1e-3) {
      var t1 = -pm.x/dx;
      var t2 = (image.width - pm.x)/dx;

      // keeping the larger one makes sure we're looking in the direction of the line
      var t = Math.max(t1, t2);

      pvert = new PVector(pm.x + t*dx, pm.y + t*dy);
    }

    // find the intersection with the horizontal boundaries
    if (Math.abs(dy) > 1e-3) {
      var t1 = -pm.y/dy;
      var t2 = (image.height - pm.y)/dy;

      // keeping the larger one makes sure we're looking in the direction of the line
      var t = Math.max(t1, t2);

      phoriz = new PVector(pm.x + t*dx, pm.y + t*dy);
    }

    if (pvert === undefined && phoriz === undefined) {
      return m;
    } else if (pvert === undefined) {
      return phoriz;
    } else if (phoriz === undefined) {
      return pvert;
    } else {
      if (pvert.x < 0 || pvert.x >= image.width || pvert.y < 0 || pvert.y >= image.height)
        return phoriz;
      else
        return pvert;
    }
  }*/

  //// conversions
  processing.canvasToImage = function(v) {
    // convert vector from canvas coordinates to image coordinates
    return new PVector((v.x - imgWindow.x)*image.width/ imgWindow.w,
                       (v.y - imgWindow.y)*image.height/imgWindow.h);
  }

  processing.imageToCanvas = function(v) {
    // convert vector from image coordinates to canvas coordinates
    return new PVector(imgWindow.x + v.x*imgWindow.w/image.width,
                       imgWindow.y + v.y*imgWindow.h/image.height);
  }
}

//// conversion functions
function toDevice(x) {
  // convert from pixels to device coordinates
  return x*window.devicePixelRatio;
}

function fromDevice(x) {
  // convert from device coordinates to pixels
  return x/window.devicePixelRatio;
}

//// function to initialize the sketch
function initSketch(imgName) {
  imageName = imgName;
  processingInstance = new Processing(canvas, sketchProc);
}

//// global variables
var canvas = document.getElementById("segmenter");
var processingInstance;
var imageName;
var image;
var imgWindow = {x: 0, y: 0, w: 0, h: 0};
var contour = [];
