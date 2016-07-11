/**
 * @author Gilles Coomans <gilles.coomans@gmail.com>
 * @licence MIT
 */

var y = require('yamvish');
require('yamvish-aright');
require('yamvish-c3po');

var ID = 0;

function isStatePath(path) {
	return path.some(function(p) {
		return p[0] === '$';
	});
}

y.model = {
	save: function(context, path, protocol, modelID) {
		if (context.get('$errors.' + path))
			return;
		var value = context.output(path),
			id = value ? value.id : null,
			updateLocal = function(s) {
				context.set(path, s)
					.set('$success.' + path, true)
					.toAgora(protocol + '.update', modelID, s);
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
	delete: function(context, path, protocol, modelID, id) {
		var value = context.get(path),
			id = value ? (value.id || id) : id;
		if (!value)
			throw new Error('nothing to delete at : ' + path);
		if (!id)
			throw new Error('no id found for deletion in : ' + path);
		context.del(path);
		return y.c3po.del(protocol, id)
			.then(function(s) {
				context.set('$success.' + path, true).toAgora(protocol + '.delete', modelID, id);
				return s;
			})
			.catch(function(e) {
				context.set('$error.' + path, e.message);
				throw e;
			})
			.logError(protocol + ' - ' + path + ' delete : ' + id);
	}
};

y.Template.prototype.modelMethods = function(path, protocol, modelID) {
	return this.toMethods(path + '.saveModel', function() {
			return y.model.save(this, path, protocol, modelID);
		})
		.toMethods(path + '.deleteModel', function(e, id) {
			return y.model.delete(this, path, protocol, modelID, id);
		})
		.toMethods(path + '.loadModel', function(e, request) {
			return y.model.load(this, path, protocol, request);
		})
		.toMethods(path + '.newModel', function(e, request) {
			return y.model.create(this, path, protocol);
		});
};

y.Template.prototype.autoSave = function(path, protocol, modelID, delay) {

	var save = function(value, type, p, key) {

		var object = this.output(path),
			id = object.id,
			self = this,
			agoraUpdate = function(s) {
				self.set('$success.' + path, true)
					.toAgora(protocol + '.update', modelID, self.output(path), self);
				return s;
			},
			setError = function(e) {
				self.set('$error.' + path, e.message);
				throw e;
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
					return y.model.delete(this, path, protocol, modelID, id);
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
					.then(agoraUpdate)
					.catch(setError)
					.logError(path + ' displaceitem');
			case 'insertItem':
				return y.c3po.remote(protocol, 'insertitem', { id: id, path: p.join('.'), index: value.index, data: value.data })
					.then(agoraUpdate)
					.catch(setError)
					.logError(path + ' insertitem');
		}
	};

	return this.subscribe(path, function(value, type, p, key) {
		// console.log('auto save : update : ', value, type, p, key);
		if (this.get('$error.' + path))
			return;
		// skip any $* vars updates (as they don't belong to context output when saved)
		if (p.length && isStatePath(p))
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
				y.model.save(self, path, protocol, modelID);
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
	var mID = ID++;
	return this.client(
		y()
		.modelMethods(path, protocol)
		.onAgora(protocol + '.update', function(emitter, modelID, object) {
			if (modelID === mID) // block loop
				return;
			var obj = this.get(path);
			if (obj.id === object.id)
				this.set(path, object);
		})
		.onAgora(protocol + '.delete', function(emitter, modelID, id) {
			if (modelID === mID) // block loop
				return;
			var obj = this.get(path);
			if (obj.id === id)
				this.delete(path);
		})
		.if(validator,
			y().validate(path, validator)
		)
		.if(autoSave,
			y().autoSave(path, protocol, mID, autoSaveDelay)
		)
	);
};


y.collectionModel = {
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
	newItem: function(context, path, protocol) {
		return context.pushAsync(path,
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
	deleteItem: function(context, path, protocol, modelID, id) {
		var arr = context.get(path),
			index = 0,
			ok = arr.some(function(item) {
				if (item.id === id)
					return true;
				index++;
			});
		if (!ok) {
			console.warn('collection model (%s) could not delete item : no item found with ', path, id);
			return Promise.reject(new Error('deleteItem failed : nothing found with :' + id));
		}
		context.del(path + '.' + index);
		return y.c3po.del(protocol, id)
			.then(function(s) {
				context.set('$success.' + path, true)
					.toAgora(protocol + '.delete', modelID, id);
				return s;
			})
			.catch(function(e) {
				context.set('$error.' + path, e.message);
				throw e;
			})
			.logError(protocol + ' - ' + path + ' deleteItem : ' + id);
	}
};

y.Template.prototype.autoSaveCollection = function(path, protocol, mID, delay) {};

y.Template.prototype.collectionModelMethods = function(path, protocol, modelID) {
	return this
		.toMethods(path + '.deleteItem', function(e, id) {
			return y.collectionModel.deleteItem(this, path, protocol, modelID, id);
		})
		.toMethods(path + '.loadCollection', function(e, request) {
			return y.collectionModel.load(this, path, protocol, request);
		})
		.toMethods(path + '.newItem', function(e, request) {
			return y.collectionModel.newItem(this, path, protocol);
		});
};

y.Template.prototype.collectionModel = function(path, protocol, autoSave, validator) {
	if (arguments.length === 1) {
		protocol = path.protocol;
		autoSave = path.autoSave;
		validator = path.validator;
		path = path.path;
	}
	var mID = ID++;
	return this.client(
		y()
		.collectionModelMethods(path, protocol, mID) // newItem(), loadCollection(query), saveItem(index), deleteItem(index)
		.onAgora(protocol + '.update', function(emitter, modelID, object) {
			if (modelID === mID) // block loop
				return;
			var arr = this.get(path),
				index = 0,
				self = this;
			arr.some(function(item) {
				if (item.id === object.id) {
					if (item === object)
						self.notify('set', path + '.' + index, item, index);
					else
						self.set(path + '.' + index, object);
					return true;
				}
				index++;
			});
		})
		.onAgora(protocol + '.delete', function(emitter, modelID, id) {
			if (modelID === mID) // block loop
				return;
			var arr = this.get(path),
				index = 0;
			var ok = arr.some(function(item) {
				if (item.id === id)
					return true;
				index++;
			});
			if (ok)
				this.delete(path + '.' + index);
		})
		.if(validator, // should be an array's validator
			y().validate(path, validator)
		)
		.if(autoSave, // should be :
			y().autoSaveCollection(path, protocol, mID)
			// should do "collection save" management : aka do remote : post new item, insertItem, displaceItem
		)
	);
};
