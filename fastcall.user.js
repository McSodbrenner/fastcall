// ==UserScript==
// @name        Fastcall
// @namespace   https://github.com/McSodbrenner/fastcall
// @description Links automatically german and international phone numbers in webpages. The link is free configurable, so it works with tel:, callto:, snom phones etc.
// @author      Christoph Erdmann
// @include     http://*
// @include     https://*
// @version     1.13
// @require     https://ajax.googleapis.com/ajax/libs/jquery/1.7.2/jquery.min.js
// @require     https://raw.github.com/sizzlemctwizzle/GM_config/master/gm_config.js
// @icon        http://s3.amazonaws.com/uso_ss/icon/138227/large.png
// ==/UserScript==


function log(msg){ unsafeWindow.console.log(msg); }

window.addEventListener("load", function(e) {
	try {
		var htmlspecialchars = function(unsafe) {
			return unsafe
				.replace(/\&/g, "&amp;")
				.replace(/</g, "&lt;")
				.replace(/>/g, "&gt;")
				.replace(/"/g, "&quot;")
				.replace(/'/g, "&#039;");
		}

		var css = '#GM_config label { display: block; width: 200px; float: left; padding: 4px 0 0 0; }'
			+ '#GM_config label small { display: block; color: #666; }'
			+ '#GM_config .config_var { clear: left; padding: 5px 0 10px 0; }'
			+ '#GM_config_header { background: #eee; padding: 5px 0; margin: 0 0 20px 0 !important; }';

		GM_config.init('Fastcall Einstellungen', {
			'href': { 'label': 'URL:', 'type': 'text', 'default': 'tel:[#]' },
			'default_international': { 'label': 'Standard-Landesvorwahl: <small>z.B. 0049</small>', 'type': 'string', 'default': '0049' },
			'company_number': { 'label': 'Eigene Nummer ohne Durchwahl: <small>mit Landesvorwahl</small>', 'type': 'string', 'default': '' },
			'call_external': { 'label': 'Amtsvorwahl: <small>z.B. "0"</small>', 'type': 'string', 'default': '' },
		}, css);
		GM_registerMenuCommand('Fastcall: Einstellungen', function(){ GM_config.open(); });

		var config = {
			'href':						GM_config.get('href'),
			'default_international':	String(GM_config.get('default_international')),
			'company_number':			String(GM_config.get('company_number')),
			'call_external':			String(GM_config.get('call_external')),
		};

		// Listener für markierte Texte einfügen
		$(document).keydown(function(e) {
			// pressed strg+^
			if (e.keyCode == 220 && !e.shiftKey && e.ctrlKey && !e.altKey && !e.metaKey) {
				// try to find selection in text nodes
				var match = window.getSelection().toString();
				if (match == '') {
					// try to find selection in input field
					var active = document.activeElement;
					if (active.tagName == 'INPUT') {
						match = active.value.substring(active.selectionStart, active.selectionEnd);
					}
				}

				// Wenn nichts selektiert ist, Einstellungen öffnen
				if (match == '') GM_config.open();

				var tech = createRawNumber(match);

				if (tech != false) {
					var new_href = createCallString(tech);

					if (new_href.match(/https?\:/)) {
						GM_xmlhttpRequest({
							method: "GET",
							url: new_href,
						});
					} else {
						location.href = new_href;
					}
				}
			}
		});

		var createRawNumber = function(tech) {
			// alles außer zahlen und +-Zeichen killen
			tech = tech.replace(/[^+0-9]/g, '');

			// Deutsche Nummern haben mindestens 10 Ziffern
			if (tech.length < 10) return false;

			// Plus durch Doppel-Null ersetzen
			tech = tech.replace(/\+/g, '00');

			// internationale Vorwahl evtl ergänzen
			tech = tech.replace(/^0([1-9])/, config.default_international + "$1");

			// Vorwahl 0 bei internationalen Nummern löschen (kann sich einschleichen bei so einer Schreibweise: +49 (0)40...)
			tech = tech.replace(/^(00\d\d)0/, "$1");

			// anhand des Aufbaus untersuchen, ob sie gültig sein kann
			if (!tech.match(/^((00[1-9][1-9])|0)[1-9]+/g)) return false;

			// Wegschneiden von Nummern, um interne Calls zu ermöglichen
			var old = tech;
			var regex = new RegExp(config.company_number);
			tech = tech.replace(regex, '');

			if (old == tech) {
				// Amtsvorwahl davor packen
				tech = config.call_external + tech;
			}

			return tech;
		}

		var createCallString = function(no) {
			no = no.replace(/fastcall\:/, '');
			return config.href.replace(/\[#\]/, no);
		}

		// Zuerst grob nach Telefonnummern suchen
		// Deutsche Nummern haben mindestens 10 Ziffern
		// Achtung, es werden auch sehr viele Leerzeichen gemacht
		// Durch alle Text-Nodes iterieren
		// Ein Timeout ist nützlich, damit bei Ajax-Seiten wie die Google-Suche das Ding auch meistens funktioniert
		setTimeout(function(){
			// Existierende Phone-Links befreien, damit wir sie neu machen können
			$('a[href^="tel:"], a[href^="callto:"], a[href^="sip:"]').each(function(){
				var $this = $(this);
				$this.replaceWith($this.text());
			});

			var xPathResult = document.evaluate('.//text()[normalize-space(.) != "" and not(ancestor::code) and not(ancestor::iframe) and not(ancestor::noscript) and not(ancestor::script) and not(ancestor::style) and not(ancestor::textarea)]', document.body, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
			var phone_regex = /([^0-9()+\/]*)([0-9()+\/][0-9\s()+\/-]{9,})([^0-9()+\/]*)/;
			var i = 0;
			var l = xPathResult.snapshotLength;

			for (i; i < l; i++) {
				var textNode = xPathResult.snapshotItem(i);

				var matches = phone_regex.exec(textNode.data);
				if (matches == null) continue;

				var full = matches[2]; // readable
				var tech = createRawNumber(full); // technical
				if (!tech) return htmlspecialchars(matches[0]);

				// href erstellen
				var new_href = createCallString(tech);

				// durch Link ersetzen
				// Weil man bei snom-Telefonen evtl. IP und PIN des Telefons sehen würde,
				// wird der Call-Link-String erst bei Klick erzeugt
				var new_content = htmlspecialchars(matches[1]) + '<a href="fastcall:'+tech+'">'+htmlspecialchars(full)+'</a>' + htmlspecialchars(matches[3]);

				$(textNode).replaceWith(new_content);
			}

			// Es soll ja auch etwas bei Klick passieren :)
			$('a[href^="fastcall:"]').on('click', function(e){
				e.preventDefault();
				var new_href = createCallString($(this).attr('href'));

				if (config.href.match(/https?\:/)) {
					GM_xmlhttpRequest({
						method: "GET",
						url: new_href,
					});
				} else {
					location.href = new_href;
				}
			});
		}, 1000);

	} catch(e) {
		log(e);
	}
}, false);
