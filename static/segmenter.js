var canvas = document.getElementById("segmenter");
var image;
var scale;
var disp_x, disp_y;
var pos_x, pos_y;
var clicking;
var waiting_to_load;
var loading_angle = 0.0;
var imageName;
//var noAccess = false;

var contour = [];
function sketchProc(processing) {
  var px_width = 400, px_height = 400;
  var dev_width = px_width*window.devicePixelRatio;
  var dev_height = px_height*window.devicePixelRatio;

  processing.size(dev_width, dev_height);
  
  canvas.style.width = px_width + "px";
  canvas.style.height = px_height + "px";
  
  processing.updateMouseShape = function() {
    var m_pos = new PVector(processing.mouseX, processing.mouseY);
    m_pos.mult(window.devicePixelRatio);
    if (processing.isInside(m_pos)) {
      processing.cursor(processing.CROSS);
    } else {
      processing.cursor(processing.ARROW);
    }
  }

  processing.setup = function() {
    image = processing.requestImage(imageName);
    image.sourceImg.onerror = function() {
        processing.noAccess = true;
      };
    if (!image)
      processing.noAccess = true;
    else
      processing.noAccess = false;

    waiting_to_load = true;
    clicking = false;
  }
  
  processing.mousePressed = function() {
    clicking = true;
    var m_start = new PVector(processing.mouseX, processing.mouseY);
    m_start.mult(window.devicePixelRatio);
    contour = [m_start];
    processing.redraw();
  }
  
  processing.mouseDragged = function() {
    var m = new PVector(processing.mouseX, processing.mouseY);
    m.mult(window.devicePixelRatio);
    contour.push(m);
    processing.updateMouseShape();
    processing.redraw();
  }
  
  processing.mouseMoved = function() {
    processing.updateMouseShape();
  }
  
  processing.mouseReleased = function() {
    clicking = false;
    if (contour.length > 0)
      contour.push(contour[0]);
    processing.redraw();
  }
  
  processing.isInside = function(m_pos) {
    return (m_pos.x >= pos_x && m_pos.y >= pos_y &&
        m_pos.x < pos_x + disp_x && m_pos.y < pos_y + disp_y);
  }

  processing.draw = function() {
    processing.background(224);

    if (waiting_to_load) {
      if (image.width < 0 || image.height < 0)
        processing.noAccess = true;
      if (image.width > 0 && image.height > 0) {
        scale = Math.min(processing.width/image.width,
                         processing.height/image.height);
        disp_x = image.width*scale;
        disp_y = image.height*scale;

        pos_x = (processing.width - disp_x) / 2;
        pos_y = (processing.height - disp_y) / 2;

        waiting_to_load = false;
        processing.noLoop();
      } else {
        processing.fill(255);

        processing.textAlign(processing.CENTER, processing.CENTER);
        var ls = 50.0;
        processing.textSize(ls);

        var ltext;
        if (!processing.noAccess) {
          ltext = "loading";
        } else {
          ltext = "can't access";
        }
        var lw = processing.textWidth(ltext);
        processing.text(ltext, processing.width/2, processing.height/2);

        processing.noFill();
        processing.stroke(255);
        processing.strokeWeight(8.0);
        var cw = ls;
        var cx = (processing.width - lw)/2 - cw;
        var cy = processing.height/2;
        if (!processing.noAccess) {
          var ca = processing.PI/1.5;
          processing.ellipseMode(processing.CENTER);
          processing.arc(cx, cy, cw, cw, loading_angle, loading_angle+ca);
          loading_angle += 0.3;
        } else {
          var cc = cw/2.8;
          processing.line(cx-cc, cy-cc, cx+cc, cy+cc);
          processing.line(cx+cc, cy-cc, cx-cc, cy+cc);
        }

        return;
      }
    }
    
    processing.image(image, pos_x, pos_y, disp_x, disp_y);
    
    if (contour.length > 0) {
      if (clicking) {
        processing.noFill();
      } else {
        processing.fill(128, 32, 32, 64);
      }
      processing.stroke(255);
      processing.strokeWeight(3);

      processing.beginShape();
      var i;
      for (i = 0; i < contour.length; ++i) {
        processing.vertex(contour[i].x, contour[i].y);
      }
      processing.endShape();
    }
  }
}

function initSketch(imgName) {
  imageName = imgName;
  processingInstance = new Processing(canvas, sketchProc);
}

function UrlExists(url)
{
  var http = new XMLHttpRequest();
  http.open('HEAD', url, false);
  http.send();
  return http.status != 404;
}

var processingInstance;
