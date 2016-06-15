# yamvish-model

Model management tools for yamvish.

It uses and gather yamvish-c3po and yamvish-aright to provide 
- Model related methods (new, save, delete, get), 
- autoSave on model change, 
- auto model validation

Take a look to index.js. clean. minimal. simple. easily adaptable.

## install

As it comes as an CommonJS module usable with browserify by example, simply install it with npm in your project folder, where you have previously installed yamvish.
```
npm i yamvish-model --save
```

## Example

```javascript
var y = require('yamvish');
require('yamvish-model');

var template = y()
.load('$this', 'myprotocol.first::?published')
.model('$this', 'myprotocol', true /* autoSave */ /* , ?arightRule */)
.div(
  y().h(1, y().contentEditable('{{ title }}', null, 'text', 'blur'))
  .p(
    y().contentEditable('{{ content }}', null, 'text', 'blur')
  )
);
```

See [c3po](https://github.com/nomocas/c3po) and [yamvish-c3po](https://github.com/nomocas/c3po) for protocols definition and usage.


More coming soon.

## Licence

The [MIT](http://opensource.org/licenses/MIT) License

Copyright (c) 2015 Gilles Coomans <gilles.coomans@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the 'Software'), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

