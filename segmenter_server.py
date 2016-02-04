#! /usr/bin/env python
from flask import Flask, url_for, render_template, render_template_string, request
import os
import ctypes
import flask
import base64
import json

#import matplotlib as mpl
#mpl.use('Agg')

#import matplotlib.pyplot as plt
#import seaborn as sns

app = Flask(__name__)

base_path = os.path.expanduser('~')
start_path = os.getcwd()
#start_path = "Pictures/2014-01-20"

@app.route('/')
def index():
  return render_template('folder.html', selected_menu='/',
    contents=getFolderContents(start_path),
    crt_path=os.path.realpath(os.path.join(base_path, start_path)))

@app.route('/about')
def about():
  return render_template('about.html', selected_menu='/about')

@app.route('/folder/<path:path>')
def enter_folder(path):
  return render_template('folder.html', selected_menu='/',
    contents=getFolderContents(path),
    crt_path=os.path.realpath(os.path.join(base_path, path)))

@app.route('/folder/')
def base_folder():
  return enter_folder('')

def parseDict(form, base):
  res = {}
  prefix = base + '['
  for key in form.keys():
    if key.startswith(prefix) and key[-1] == ']':
      res[key[len(prefix):-1]] = form[key]

  return res

@app.route('/save', methods=['GET', 'POST'])
def save_file():
  if request.method == 'POST':
    segmentation = str(request.form['image'])
    segmentation = segmentation[segmentation.find(',')+1:]
    name = str(request.form['imageName'])
    root, ext = os.path.splitext(name)
    seg_name = root + '_segmented.png'
    with open(seg_name, 'wb') as f:
      f.write(base64.b64decode(segmentation))

    tags = json.loads(request.form['tags'])
    tag_name = root + '_segmented.txt'
    with open(tag_name, 'w') as f:
      for crt_tag in tags:
        f.write(crt_tag[0] + ': ' + crt_tag[1] + '\n')

    return ('', 204)

@app.route('/segment/<path:path>')
def segment(path):
  full_path = os.path.join(base_path, path)
  return render_template('action.html', selected_menu='/',
      image="/serveimage/" + path, image_name=os.path.basename(path),
      image_path=full_path)

@app.route('/serveimage/<path:path>')
def serve_image(path):
  if '..' in path or path.startswith('/'):
    flask.abort(404)
  return flask.send_file(os.path.join(base_path, path))

class File(object):
  def __init__(self, name, path):
    self.name = name
    self.path = path

def getFolderContents(path):
  path = os.path.join(base_path, path)
  if not os.path.samefile(path, base_path):
    folders = [File(name='..', path=
        os.path.relpath(os.path.join(path, '..'), base_path))]
  else:
    folders = []

  files = []
  dir_res = os.listdir(path)
  for fname in dir_res:
    full_name = os.path.relpath(os.path.join(path, fname), base_path)
    abs_name = os.path.abspath(os.path.join(base_path, full_name))
    base_name = os.path.basename(full_name)
    crt_file = File(name=base_name, path=full_name)
    if is_hidden(abs_name):
      continue

    if os.path.isdir(abs_name):
      folders.append(crt_file)
    else:
      files.append(crt_file)

  class FolderContents(object):
    def __init__(self, folders, files):
      self.folders = folders
      self.files = files

  return FolderContents(folders, files)

def is_hidden(filepath):
    name = os.path.basename(os.path.abspath(filepath))
    return name.startswith('.') or has_hidden_attribute(filepath)

def has_hidden_attribute(filepath):
    try:
        attrs = ctypes.windll.kernel32.GetFileAttributesW(unicode(filepath))
        assert attrs != -1
        result = bool(attrs & 2)
    except (AttributeError, AssertionError):
        result = False
    return result

if __name__ == '__main__':
  app.run(debug=True)
