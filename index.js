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
				context.set(path, s).toAgora(protocol + '.update', s);
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
		return context.setAsync(path,
			y.c3po.default(protocol)
			.then(function(obj) {
				return y.c3po.post(protocol, obj);
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
			.then(function(s) {
				context.toAgora(protocol + '.delete', id);
				return s;
			})
			.logError(protocol + ' - ' + path + ' delete : ' + id);
	}
};

y.Template.prototype.modelMethods = function(path, protocol) {
	return this.toMethods(path + '.saveModel', function() {
			return y.model.save(this, path, protocol);
		})
		.toMethods(path + '.deleteModel', function(id) {
			return y.model.delete(this, path, protocol, id);
		})
		.toMethods(path + '.loadModel', function(request) {
			return y.model.load(this, path, protocol, request);
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

		var object = this.get(path),
			id = object.id,
			self = this,
			agoraUpdate = function(s) {
				self.toAgora(protocol + '.update', object, this);
				return s;
			};

		switch (type) {
			case 'set':
				if (!p.length)
					return; // nothing to do as : it has been loaded or .create will post it
				else
					return y.c3po.patch(protocol, id, value, p.join('.'))
						.then(agoraUpdate)
						.log(path + ' patch property');
			case 'delete':
				if (!p.length)
					return y.model.delete(this, path, protocol, id);
				else
					return y.c3po.remote(protocol, 'deleteproperty', { id: id, path: p.join('.') })
						.then(agoraUpdate)
						.logError(path + ' delete property');
			case 'push':
				return y.c3po.remote(protocol, 'pushitem', { id: id, data: value, path: p.join('.')  })
					.then(agoraUpdate)
					.logError(path + ' pushitem');
			case 'displaceItem':
				return y.c3po.remote(protocol, 'displaceitem', { id: id, path: p.join('.'), fromIndex: value.fromIndex, toIndex: value.toIndex })
					.logError(path + ' displaceitem')
					// .then(agoraUpdate);
			case 'insertItem':
				return y.c3po.remote(protocol, 'insertitem', { id: id, path: p.join('.'), index: value.index, data: value.data })
					.logError(path + ' insertitem')
					// .then(agoraUpdate);
		}
	}, true /* upward */ );
};


y.Template.prototype.model = function(path, protocol, autoSave, rule) {
	return this.client(
		y()
		.modelMethods(path, protocol)
		.onAgora(protocol + '.update', function(emitter, object) {
			if (emitter === this) // block loop
				return;
			var obj = this.get(path);
			if (obj.id === object.id)
				this.set(path, object);
		})
		.onAgora(protocol + '.delete', function(emitter, id) {
			if (emitter === this) // block loop
				return;
			var obj = this.get(path);
			if (obj.id === id)
				this.delete(path);
		})
		.if(rule,
			y().validate(path, rule)
		)
		.if(autoSave,
			y().autoSave(path, protocol)
		)
	);
};
