(function (factory) {
    var global = window;
    var $ = global.$ || global.jQuery;
    var _ = global._ || global.lodash;

    if (!$) throw new Error('SirTrevorAdapter requires jQuery');
    if (!_) throw new Error('SirTrevorAdapter requires lodash');

    global.SirTrevorAdapter = factory($, _);
} (function($, _) {
    'use strict';
    /** @class SirTrevorAdapter */

    /**
     * The minimun representation for a SirTrevor data instance.
     * @typedef {Object} SirTrevorData
     * @property {String} type - The type of this instance
     * @property {Object} data - The data that represents the object type.
     */

    /**
     * @typedef {Object} SirTrevorAdapterTemplates
     * Each key for this template should correspond to a SirTrevorData type. The value can be
     * a String that will be interpolated via `lodash.template` or a `function (data)` that
     * recives as first argument the data of the SirTrevorData.
     */
    var templates = {
        'text': '<%= text %>',
        'quote': '<quote><%= text %></quote>',
        'image': '<div><img src="<%- file.url %>"/></div>',
        'heading': '<h2><%= text %></h2>',
        'list': '<ul><% _.each(listItems, function(e) { %><li><%- e.content %></li><% }) %></ul>',
        'tweet': '<div></div>', // TODO
        'widget': '<%= text %>',
        'button': function(data) {
            var a = $('<a>');
            a.html(data.text);
            a.attr('href', data.href);
            Object.keys(data).filter(function (b) { return /^css\-/.test(b); })
                .forEach(function (b) {
                    var prop = b.replace(/^css\-/, '');
                    a.css(prop, data[b]);
                });

            // Other css necesary 
            a.css('display', 'block');
            a.css('box-sizing', 'border-box');
            a.css('border-style', 'solid');
            a.css('padding-top', '0.8em');
            a.css('padding-bottom', '0.5em');
            a.css('text-align', 'center');
            a.css('margin', '0 auto');

            return a[0].outerHTML;
        },
        'video': function(data) {

            // more providers at https://gist.github.com/jeffling/a9629ae28e076785a14f
            var providers = {
                vimeo: {
                    regex: /(?:http[s]?:\/\/)?(?:www.)?vimeo\.co(?:.+(?:\/)([^\/].*)+$)/,
                    html: "<iframe src=\"<%= protocol %>//player.vimeo.com/video/<%= remote_id %>?title=0&byline=0\" width=\"580\" height=\"320\" frameborder=\"0\"></iframe>"
                },
                youtube: {
                    regex: /^.*(?:(?:youtu\.be\/)|(?:youtube\.com)\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*)/,
                    html: "<iframe src=\"<%= protocol %>//www.youtube.com/embed/<%= remote_id %>\" width=\"580\" height=\"320\" frameborder=\"0\" allowfullscreen></iframe>"
                }
            };

            if (!providers.hasOwnProperty(data.source))
                return "";

            var source = providers[data.source];

            var protocol = window.location.protocol === "file:" ? 
              "http:" : window.location.protocol;

            return _.template(source.html, {
                protocol: protocol,
                remote_id: data.remote_id
            });
        },
        'map': function(data) {
            var img_src = _.template("https://maps.googleapis.com/maps/api/staticmap?size=<%= width %>x<%= height %>&center=<%= address %>&markers=|<%= address %>&zoom=<%= zoom %>&scale=2", data);
            var map_ref = _.template("http://maps.google.com/maps?q=<%= address %>", data);
            var template = '<a href="<%= map_ref %>"><img src="<%= img_src %>" /></a>';
            return _.template(template, { img_src: img_src, map_ref: map_ref });
        }
    }

    /**
     * @typedef {Object} SirTrevorAdapterConfig
     * @property {String} elementEnclosingTag - Defines the HTML tag to be used arround every SirTrevorData that is serialized by this instance.
     * @property {String} elementClass - Defines the class to be added to the HTML added arround every SirTrevorData serialized by this instance.
     * @property {boolean} addElementTypeClass - Determines if a type specific class should be added alongside the `elementClass`.
     * @property {String} attrName - Defines the attribute name added to the HTML for each SirTrevorData. Note this will be always prepended by `data-`
     * @property {SirTrevorAdapterTemplates} templates - @see SirTrevorAdapterTemplates
     */
    var defaultConfig = {
        elementEnclosingTag: 'div',
        elementClass : 'st-render',
        addElementTypeClass : true,
        containerClass: 'st-render-container',
        attrName: 'st',
    }

    /**
     * Creates a new instance of SirTrevorAdapter. Each instance has its own config and templates.
     * @constructor
     * @param {SirTrevorAdapterConfig}
     * @see SirTrevorAdapterConfig
     * @see SirTrevorAdapterTemplates
     */
    var SirTrevorAdapter = function(config) {
        config = config || {};
        this.templates = _.defaults(config.templates || {}, templates);

        delete config.template;
        this.config = _.defaults(defaultConfig, config);
    };

    /**
     * @private
     * @param {Mixed} obj - The object of study
     * @returns {boolean} {true} if the given obj is a valid {SirTrevorData}; or {false} otherwise
     * @requires lodash
     * @memberof SirTrevorAdapter
     */
    SirTrevorAdapter.prototype._isSirTrevorData = function(obj) {
        return obj && obj.type && obj.data && _.isObject(obj.data);
    };

    /**
     * @public
     * @desc Finds the HTML template for the type given and compiles it with the data provided.
     * @param {String} type - The type of template you want to render.
     * @param {Object} data - The data to be used as template replacements.
     * @returns {String} The compiled HTML for the combination of arguments given. If a not valid type is given an empty String is returned.
     * @memberof SirTrevorAdapter
     * @requires lodash
    */
    SirTrevorAdapter.prototype.renderType = function(type, data) {

        if (!type)
            throw new Error('type can\'t be undefined');

        var template = this.templates[type];

        if (!template) {
            // There is not a direct candidate, we are trying to do our best in
            // finding a possible one (maybe we are trying to render an extended version of a module (e.g. image -> image_edit))
            var guessed = Object.keys(this.templates)
                                .reduce(function (v, c) {
                                    if (v !== null) // We already found a candidate
                                        return v;
                                    if (type == c.substring(0, type.length))
                                        return c;
                                    else
                                        return null;
                                }, null);

            if (!guessed) {
                console.error('No template for type ' + type);
                return '';
            } else
                template = this.templates[guessed];
        }

        var result = "";

        try {
            if (_.isFunction(template))
                result = template(data);
            else
                result = _.template(template, data);
        } catch(e) {
            console.error("Error while generating templated view for " + type);
            console.error(e);
        }

        return result;
    }

    /**
     * Given a SirTrevor object this function returns the HTML that will be able to serve as a representation
     * of the given object and also it is an HTML that this library is able to convert back to the original
     * JSON representation
     * @param {Object} obj - An instance of SirTrevor data, this must contain type and data properties.
     * @returns {String} The HTML generated for the given object.
     * @memberof SirTrevorAdapter
     * @requires jQuery
     */
    SirTrevorAdapter.prototype.map = function(obj) {
        if (!this._isSirTrevorData(obj)) {
            console.error(JSON.stringify(obj) + ' is not a valid SirTrevor object');
            return '';
        }

        var innerHTML = this.renderType(obj.type, obj.data);
        var classes = [ this.config.elementClass ];
        // If the config is set, also add the element type associated class
        if (this.config.addElementTypeClass)
            classes.push (this.config.elementClass + '-' + obj.type);

        var container = $('<' + this.config.elementEnclosingTag + '>', { class: classes.join(' ') });
        container.attr('data-' + this.config.attrName, JSON.stringify(obj));
        container.html(innerHTML);
        return container[0].outerHTML;
    }

    /**
     * Given a collection (or a single) of SirTrevorData, the function returns an HTML that contains
     * the rendered view for each element warped arround a single DOM element.
     * @param {SirTrevorData | SirTrevorData[]} json - The data to be serialized to HTML.
     * @returns {String} The HTML representation of each element. Also contains enough data for recover the original JSON afterwards.
     * @memberof SirTrevorAdapter
     * @requires lodash
     */
    SirTrevorAdapter.prototype.toHTML = function(json) {
        var wasArray = true;
        if (!_.isArray(json)) {
            json = [ json ];
            wasArray = false;
        }

        var container = $('<' + this.config.elementEnclosingTag + '>', { class: this.config.elementClass + '-container' });
        var mapped = json.map(this.map, this).join('\n');

        if (wasArray)
            return '<div class="' + this.config.containerClass + '">' + mapped + '</div>';
        else
            return mapped;
    }
    SirTrevorAdapter.prototype.fromJSON = SirTrevorAdapter.prototype.toHTML;

    /**
     * Given an HTML generated by an instance of SirTrevorAdapter, this function returns the original JSON
     * used to generate the given HTML.
     * @param {String} html - The HTML to be parsed.
     * @memberof SirTrevorAdapter
     * @returns {SirTrevorData[]} The collection of SirTrevor Data recovered from the HTML.
     */
    SirTrevorAdapter.prototype.toJSON = function(html) {
        var self = this;
        var doms = $(html);
        var $doms = $(doms);
        var result = [];
        $doms.find('.st-render').each(function (i, obj) {
            result.push($(obj).data(self.config.attrName));
        });
        return result;
    }
    SirTrevorAdapter.prototype.fromHTML = SirTrevorAdapter.prototype.toJSON;

    // Expose static field
    SirTrevorAdapter.Defaults = {};
    SirTrevorAdapter.Defaults.Templates = templates;

    return SirTrevorAdapter;
}));