/**
 * @author Gilles Coomans <gilles.coomans@gmail.com>
 * @licence MIT
 */

var y = require('yamvish');
require('yamvish-aright');
require('yamvish-c3po');

y.model = {
	save: function(context, path, protocol) {
		if (context.get('$errors.' + path))
			return;
		var value = context.output(path),
			id = value ? value.id : null,
			updateLocal = function(s) {
				context.set(path, s);
				return s;
			};
		if (!value)
			throw new Error('nothing to save at : ' + path);
		if (id)
			return y.c3po.put(protocol, value)
				.then(updateLocal)
				.logError(path + ' put');
		else
			return y.c3po.post(protocol, value)
				.then(updateLocal)
				.logError(path + ' post');
	},
	load: function(context, path, protocol, request) {
		return context.setAsync(path, y.c3po.get(protocol, request))
			.logError(path + ' get');
	},
	create: function(context, path, protocol) {
		return context.waiting(
			y.c3po.default(protocol)
			.then(function(obj) {
				return y.c3po.post(protocol, obj);
			})
			.then(function(s) {
				context.set(path, s);
				return s;
			})
			.logError(path + ' post')
		);
	},
	delete: function(context, path, protocol, id) {
		var value = context.get(path),
			id = value ? (value.id || id) : id;
		if (!value)
			throw new Error('nothing to save at : ' + path);
		if (!id)
			throw new Error('no id found for deletion in : ' + path);
		context.del(path);
		return y.c3po.del(protocol, id)
			.logError(path + ' delete');
	}
};

y.Template.prototype.modelMethods = function(path, protocol) {
	return this.toMethods(path + '.saveModel', function() {
			return y.model.save(this, path, protocol);
		})
		.toMethods(path + '.deleteModel', function(id) {
			return y.model.delete(this, path, protocol, id);
		})
		.toMethods(path + '.getModel', function(request) {
			return y.model.get(this, path, protocol, request);
		})
		.toMethods(path + '.newModel', function(request) {
			return y.model.create(this, path, protocol);
		});
};

y.Template.prototype.autoSave = function(path, protocol) {
	return this.subscribe(path, function(value, type, p, key) {
		// console.log('auto save : update : ', value, type, p, key);
		if (this.get('$errors.' + path))
			return;
		// skip any $* vars updates (as they don't belong to context output when saved)
		if (p.length && p[0][0] === '$')
			return;

		var id = this.get(path + '.id'),
			self = this;

		switch (type) {
			case 'set':
				if (!p.length)
					return; // nothing to do as : it has been loaded or .create will post it
				else
					return y.c3po.patch(protocol, id, value, p.join('.'))
						.logError(path + ' patch property');
			case 'delete':
				if (!p.length)
					return y.model.delete(this, path, protocol, id);
				else
					return y.c3po.remote(protocol, 'deleteproperty', { id: id, path: p.join('.') })
						.logError(path + ' delete property');
			case 'push':
				return y.c3po.remote(protocol, 'pushitem', { id: id, data: value, path: p.join('.')  })
					.logError(path + ' pushitem');
			case 'displaceItem':
				return y.c3po.remote(protocol, 'displaceitem', { id: id, path: p.join('.'), fromIndex: value.fromIndex, toIndex: value.toIndex })
					.logError(path + ' displaceitem');
			case 'insertItem':
				return y.c3po.remote(protocol, 'insertitem', { id: id, path: p.join('.'), index: value.index, data: value.data })
					.logError(path + ' insertitem');
		}
	}, true /* upward */ );
};

y.Template.prototype.model = function(path, protocol, autoSave, rule) {
	return this.client(
		y()
		.modelMethods(path, protocol)
		.if(rule,
			y().validate(path, rule)
		)
		.if(autoSave,
			y().autoSave(path, protocol)
		)
	);
};
