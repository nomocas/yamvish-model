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
				context.set(path, s)
					.set('$success.' + path, true)
					.toAgora(protocol + '.update', s);
				return s;
			},
			setError = function(e) {
				context.set('$error.' + path, e.message);
				throw e;
			};
		if (!value)
			throw new Error('nothing to save at : ' + path);
		if (id)
			return y.c3po.put(protocol, value)
				.then(updateLocal)
				.catch(setError)
				.logError(path + ' put');
		else
			return y.c3po.post(protocol, value)
				.then(updateLocal)
				.catch(setError)
				.logError(path + ' post');
	},
	load: function(context, path, protocol, request) {
		return context.setAsync(path, y.c3po.get(protocol, request))
			.then(function(s) {
				context.set('$success.' + path, true);
				return s;
			})
			.catch(function(e) {
				context.set('$error.' + path, e.message);
				throw e;
			})
			.logError(path + ' get');
	},
	create: function(context, path, protocol) {
		return context.setAsync(path,
				y.c3po.default(protocol)
				.then(function(obj) {
					return y.c3po.post(protocol, obj);
				})
			)
			.catch(function(e) {
				context.set('$error.' + path, e.message);
				throw e;
			})
			.then(function(s) {
				context.set('$success.' + path, true);
				return s;
			});
	},
	delete: function(context, path, protocol, id) {
		var value = context.get(path),
			id = value ? (value.id || id) : id;
		if (!value)
			throw new Error('nothing to delete at : ' + path);
		if (!id)
			throw new Error('no id found for deletion in : ' + path);
		context.del(path);
		return y.c3po.del(protocol, id)
			.then(function(s) {
				context.set('$success.' + path, true).toAgora(protocol + '.delete', id);
				return s;
			})
			.catch(function(e) {
				context.set('$error.' + path, e.message);
				throw e;
			})
			.logError(protocol + ' - ' + path + ' delete : ' + id);
	}
};

y.Template.prototype.modelMethods = function(path, protocol) {
	return this.toMethods(path + '.saveModel', function() {
			return y.model.save(this, path, protocol);
		})
		.toMethods(path + '.deleteModel', function(e, id) {
			return y.model.delete(this, path, protocol, id);
		})
		.toMethods(path + '.loadModel', function(e, request) {
			return y.model.load(this, path, protocol, request);
		})
		.toMethods(path + '.newModel', function(e, request) {
			return y.model.create(this, path, protocol);
		});

	/**
	 * link model : context.linkModel(path, protocol, newPath)
	 *
	 * etalir le lien entre collection et item : 
	 * 	=> utilliser dico basé sur protocol:
	 * 		.collectionModel(path, protocol)
	 * 		.model(path, protocol)
	 * 			upward sur path et 
	 *
	 * 	On Save/update
	 *		==> toAgora(protocol+'.modelUpdate', type)
	 *
	 * 		=> onAgora(protocol+'.modelUpdate', emitter, value, type, path, key)
	 * 		
	 */
};

y.Template.prototype.autoSave = function(path, protocol, delay) {

	var save = function(value, type, p, key) {

		var object = this.get(path),
			id = object.id,
			self = this,
			agoraUpdate = function(s) {
				self.set('$success.' + path, true).toAgora(protocol + '.update', object, this);
				return s;
			},
			setError = function(e) {
				self.set('$error.' + path, e.message);
				throw e;
			},
			setSuccess = function(s) {
				self.set('$success.' + path, true);
				return s;
			};

		switch (type) {
			case 'set':
				if (!p.length)
					return; // nothing to do as : it has been loaded or .create will post it
				else
					return y.c3po.patch(protocol, id, value, p.join('.'))
						.then(agoraUpdate)
						.catch(setError)
						.logError(path + ' patch property');
			case 'delete':
				if (!p.length)
					return y.model.delete(this, path, protocol, id);
				else
					return y.c3po.remote(protocol, 'deleteproperty', { id: id, path: p.join('.') })
						.then(agoraUpdate)
						.catch(setError)
						.logError(path + ' delete property');
			case 'push':
				return y.c3po.remote(protocol, 'pushitem', { id: id, data: value, path: p.join('.')  })
					.then(agoraUpdate)
					.catch(setError)
					.logError(path + ' pushitem');
			case 'displaceItem':
				return y.c3po.remote(protocol, 'displaceitem', { id: id, path: p.join('.'), fromIndex: value.fromIndex, toIndex: value.toIndex })
					.then(setSuccess)
					.catch(setError)
					.logError(path + ' displaceitem');
			case 'insertItem':
				return y.c3po.remote(protocol, 'insertitem', { id: id, path: p.join('.'), index: value.index, data: value.data })
					.then(setSuccess)
					.catch(setError)
					.logError(path + ' insertitem');
		}
	};

	return this.subscribe(path, function(value, type, p, key) {
		// console.log('auto save : update : ', value, type, p, key);
		if (this.get('$error.' + path))
			return;
		// skip any $* vars updates (as they don't belong to context output when saved)
		if (p.length && p[0][0] === '$')
			return;

		if (type === 'set' && !p.length)
			return; // nothing to do as : it has been loaded or .create will post it or it has been updated from save action

		// console.log('autoSave update : ', delay, value, type, p);
		if (delay) {
			this._autoSave = this._autoSave || {};
			var self = this;
			if (this._autoSave[path])
				clearTimeout(this._autoSave[path]);
			this._autoSave[path] = setTimeout(function() {
				// TODO : avoid loop !!
				// save.call(self, value, type, p, key);
				y.model.save(self, path, protocol);
			}, delay);
		} else
			save.call(this, value, type, p, key);

	}, true /* upward */ );
};


y.Template.prototype.model = function(path, protocol, autoSave, validator, autoSaveDelay) {
	if (arguments.length === 1) {
		protocol = path.protocol;
		autoSave = path.autoSave;
		validator = path.validator;
		autoSaveDelay = path.autoSaveDelay;
		path = path.path;
	}
	return this.client(
		y()
		.modelMethods(path, protocol)
		// .onAgora(protocol + '.update', function(emitter, object) {
		// 	if (emitter === this) // block loop
		// 		return;
		// 	var obj = this.get(path);
		// 	if (obj.id === object.id)
		// 		this.updateData(path, object);
		// })
		// .onAgora(protocol + '.delete', function(emitter, id) {
		// 	if (emitter === this) // block loop
		// 		return;
		// 	var obj = this.get(path);
		// 	if (obj.id === id)
		// 		this.delete(path);
		// })
		.if(validator,
			y().validate(path, validator)
		)
		.if(autoSave,
			y().autoSave(path, protocol, autoSaveDelay)
		)
	);
};

y.Template.prototype.collectionModel = function(path, protocol, autoSave, validator, autoSaveDelay) {
	if (arguments.length === 1) {
		protocol = path.protocol;
		autoSave = path.autoSave;
		validator = path.validator;
		autoSaveDelay = path.autoSaveDelay;
		path = path.path;
	}
	return this.client(
		y()
		.collectionModelMethods(path, protocol) // newItem(), loadCollection(query), saveItem(index), deleteItem(index)
		// .onAgora(protocol + '.update', function(emitter, object) {
		// 	if (emitter === this) // block loop
		// 		return;
		// 	var obj = this.get(path);
		// 	if (obj.id === object.id)
		// 		this.updateData(path, object);
		// })
		// .onAgora(protocol + '.delete', function(emitter, id) {
		// 	if (emitter === this) // block loop
		// 		return;
		// 	var obj = this.get(path);
		// 	if (obj.id === id)
		// 		this.delete(path);
		// })
		.if(validator, // should be an array's validator
			y().validate(path, validator)
		)
		.if(autoSave, // should be :
			y().autoSaveCollection(path, protocol, autoSaveDelay)
			// should do "collection save" management : aka do remote : post new item, insertItem, displaceItem
		)
	);
};
