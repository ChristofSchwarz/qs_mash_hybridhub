
// Global constants
const settingsFile = 'settings_hybridhub.json';
const guid_pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

var global = {
    baseUrl: location.href.split('/extensions')[0],
    userCloud: null,
    userWin: null,
    settings: {},
    queryParamsDone: [],
    html: {},
    cloudCache: {
        spaces: {},
        users: {}
    },
    viewMode: 'cards',
    filters: {
        regexSearch: '.*',
        regexSource: '.*',
        regexStream: '.*'
    }
};


const defaultSettings = {
    qlikCloudUrl: "https://your-tenant.us.qlikcloud.com",
    webIntegrationId: "4-2ZqazVrCY9uu4UNlFrBFyjBRlkv921",
    hubTitle: "Hybrid Hub",
    //logoUrl: "./pics/dblogo.svg",
    browserConsoleLog: true,
};

// assign html forms into global var
$.get('./html/help.html').then(function (res) { global.html.help = res; });
// $.get('./html/settings.html').then(function (res) { global.html.settings = res; });
var response
response = $.ajax({ type: 'GET', url: './html/app-card.html', async: false });
global.html.cards = response.responseText;
response = $.ajax({ type: 'GET', url: './html/app-tablerow.html', async: false });
global.html.table = response.responseText;

// $.get('./html/appcard.html').then(function (res) { global.html.appCard = res; });
$.get('./html/hoverinfo.html').then(function (res) { global.html.hoverinfo = res; });

console.log('global', global);

whoAmIOnWindows();


var settings = $.ajax({ type: 'GET', url: '../../content/Default/' + settingsFile, async: false });

if (settings.status != '200') {
    createSettings();

} else {
    settings = { ...defaultSettings, ...settings.responseJSON };
    console.log('settings', settings);

    // Is QRS API listening?
    qrsAPI(
        'GET',
        '/qrs/about',
        global
    ).then(function (res) {
        $("#qrsconnected").html('Connected as <span id="whoami-win"></span>');
    }).catch(function (err) {
        console.log(err);
    });

    //----------------------------------- MAIN CODE --------------------------------

    // try connecting to Qlik SaaS API
    whoAmIOnCloud(settings);


    $('main').css('height', $('main').css('height'));
    // set an absolute height for proper scroll bars in main container
    $(window).on('resize', function () {
        $('main').css('height', $('main').css('height'));
    });

    $("#hubtitle").text(settings.hubTitle);
    $.get('./hybrid.qext').then(function (ret) {
        $("#mashupversion").text(ret.version);
    });

    if (settings.logoUrl.length > 0) {
        $('#logo').css("background-image", "url(" + settings.logoUrl + ")");
    }

    $('#qlik-saas-login').click(function () {
        $("#qlik-saas-connected").html(
            'Connecting ...'
        ).parent().removeClass('info-error');
        setTimeout(function () { whoAmIOnCloud(settings) }, 500);
    });

    $('#show-table').click(function () {
        $('#appcards-container').hide();
        $('#apptable-container').show();
        global.viewMode = 'table';
        updateURLparam('view', 'table');
        getApps(settings);
    });

    $('#show-cards').click(function () {
        $('#apptable-container').hide();
        $('#appcards-container').show();
        global.viewMode = 'cards';
        updateURLparam('view', 'cards');
        getApps(settings);
    })

    $("#searchtxt").on("input", function (e) {
        global.filters.regexSearch = new RegExp('^.*' + $("#searchtxt").val().toLowerCase() + '.*$', 'i');
        filterAppList();
    })


    $('#select_stream').on('change', function () {
        global.filters.regexStream = $('#select_stream').find(":selected").val();
        updateURLparam('stream', global.filters.regexStream);
        filterAppList();
    });

    $('#checkboxes-source input').on('click', function (e) {
        var regexSource = [];
        if ($('#checkbox-internal').is(':checked')) regexSource.push('internal');
        if ($('#checkbox-cloud').is(':checked')) regexSource.push('cloud');
        global.filters.regexSource = regexSource.length ? ('(' + regexSource.join('|') + ')') : '$.^';
        updateURLparam('source', regexSource.join(','));
        filterAppList();
    });


    $("#refresh").on('click', function () {
        streamId = $('#select_stream').find(":selected").val();
        getApps(settings, streamId);
        getStreamsAndSpaces(settings, streamId);
        getCloudUsers(settings);
    });


    $('#btn_settings').on('click', function () {
        editSettings(settings);
    });

    // initialize Bootstrap tooltips
    var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'))
    var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl)
    })

    // initialize Bootstrap popovers
    var popoverTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="popover"]'))
    var popoverList = popoverTriggerList.map(function (popoverTriggerEl) {
        return new bootstrap.Popover(popoverTriggerEl)
    });

    // Handling of Query-Strings
    const params = new URLSearchParams(window.location.search);
    if (params.has('settings')) {
        console.log('Opening Settings dialog');
        $('#btn_settings').trigger('click');
        editSettings(settings);
    } else {
        if (params.has('stream')) {
            global.filters.regexStream = params.get('stream');
            console.log('set global.filters.regexStream because of query-param "stream"', global.filters.regexStream);
        }
        if (params.has('source')) {
            const sources = params.get('source').split(',');
            $('#checkbox-internal').prop('checked', sources.indexOf('internal') > -1);
            $('#checkbox-cloud').prop('checked', sources.indexOf('cloud') > -1);
            global.filters.regexSource = sources[0].length ? ('(' + sources.join('|') + ')') : '$.^';
            console.log('set global.filters.regexSource because of query-param "source"', global.filters.regexSource);
        }
        if (params.get('view') == 'cards') $('#show-cards').trigger('click');
        if (params.get('view') == 'table') $('#show-table').trigger('click');

        getStreamsAndSpaces(settings, params.get('stream'));
        getApps(settings);
        filterAppList();
    }

}

//----------------------------------- FUNCTIONS --------------------------------

function updateURLparam(param, value) {

    var params = new URLSearchParams(window.location.search);
    params.delete('qlikTicket');  // in case this param is in the URL, remove it
    params.delete('settings');

    if (history.pushState && param) {
        var newurl = window.location.protocol + "//" + window.location.host + window.location.pathname + '?';
        params.set(param, value);
        newurl += params.toString();
        window.history.pushState({ path: newurl }, '', newurl);
    }
}

function qlikCloudAPI(method, endpoint, settings, asPromise = false) {

    var arg = {
        url: (endpoint.substr(0, 4) == 'http' ? '' : settings.qlikCloudUrl) + endpoint,
        method: method,
        timeout: 0,
        headers: {
            "qlik-web-integration-id": settings.webIntegrationId
        },
        xhrFields: {
            withCredentials: true
        },
        async: asPromise
    };
    return $.ajax(arg);
}

function qlikCloudLoopData(endpoint, settings, handler) {

    var url = endpoint;
    do {
        const resp = qlikCloudAPI('GET', url, settings, false);
        if (resp.status == 200) {
            resp.responseJSON.data.forEach(handler);
            url = resp.responseJSON.links.next ? resp.responseJSON.links.next.href : null;
        } else {
            console.error(resp);
            url = null;
        }
    } while (url);

}

function qrsAPI(method, endpoint, global, asPromise = false, body) {

    const xrfKey = Math.random().toString().substr(2).repeat(16).substr(0, 16);
    var arg = {
        url: global.baseUrl + endpoint + (endpoint.indexOf('?') > -1 ? '&' : '?') + 'xrfkey=' + xrfKey,
        method: method,
        timeout: 0,
        headers: {
            "X-Qlik-Xrfkey": xrfKey
        },
        xhrFields: {
            withCredentials: true
        },
        async: asPromise
    };
    if (body) arg.data = body;

    return $.ajax(arg);
}

function whoAmIOnCloud(settings) {

    const whoAmI = qlikCloudAPI('GET', '/api/v1/users/me', settings);

    if (whoAmI.status == 200) {
        $('#cloud-connected').html('Connected as ' + whoAmI.responseJSON.email);
        global.userCloud = whoAmI.responseJSON.email;
        getCloudUsers(settings);
        getStreamsAndSpaces(settings);

    } else if (whoAmI.status == 401 || whoAmI.status == 404) {

        $('#signin-err').show();
        $("#qlikcloud-url").attr('href', settings.qlikCloudUrl);

    } else {
        console.error(`Error calling Qlik SaaS API ${whoAmI.status} ${whoAmI.statusText}`);
    }
}

function getStreamsAndSpaces(settings, streamId) {

    $('#select_stream').find(":selected").val(); // remember current selection
    $('#select_stream').html('<option value=".*">* All Streams and Spaces</option>');

    function sortSelectOptions() {
        // sort option elements
        var selectElm = $("#select_stream"),
            selectSorted = selectElm.find("option").toArray().sort(function (a, b) {
                return (a.innerHTML.toLowerCase() > b.innerHTML.toLowerCase()) ? 1 : -1;
            });
        selectElm.empty();
        $.each(selectSorted, function (key, value) {
            selectElm.append(value);
        });
        // eliminate duplicates
        $("#select_stream option").each(function () {
            $(this).siblings('[value="' + this.value + '"]').remove();
        });
    }

    // get list of streams
    // if (!selectedOption && selectedOption.match(guid_pattern) != null) {
    qrsAPI('GET', "/qrs/stream", global, true)
        .then(function (streams) {
            streams.forEach(stream => {
                $('#select_stream')
                    .append($('<option></option>')
                        .val(stream.id)
                        .html(stream.name)
                        .prop('selected', stream.id == streamId)
                    );
            });
            sortSelectOptions();

        });


    // get list of spaces
    if (global.userCloud) {
        global.cloudCache.spaces = {}; // empty spaces object in cloudCache 
        qlikCloudLoopData('/api/v1/spaces?limit=100', settings, function (space) {
            $('#select_stream')
                .append($('<option></option>')
                    .val(space.id)
                    .html(space.name + ' &#x2601;')
                    .prop('selected', space.id == streamId)
                );
            global.cloudCache.spaces[space.id] = space.name; // add space to cloudCache
        });

        sortSelectOptions();
        // console.warn('cloud spaces', global.cloudCache.spaces);
    }
}


function createAppIcon(appInfoObj, appVisible) {

    var html = replaceDoubleCurlyBrackets(global.html[global.viewMode], appInfoObj);
    if ($('#' + appInfoObj.domId).length) $('#' + appInfoObj.domId).remove();
    $("#applist-" + global.viewMode).append(html);
    if (!appVisible) $('#' + appInfoObj.domId).hide();

    if (appInfoObj.thumbnail) {
        $('#' + appInfoObj.domId + ' .default-thumb').css('background-image', 'url(' + appInfoObj.thumbnail + ')');
    }
    // $('#' + appInfoObj.domId + ' .lui-icon--info').on('mouseover', function () {
    //     showAppInfo(appInfoObj)
    // })
}


function showAppInfo(appInfoObj) {

    var html = replaceDoubleCurlyBrackets(global.html.hoverinfo, appInfoObj)
    $('#qs-page-container').append(html);

    const pos = $('#' + appInfoObj.domId).offset();
    $('#div_moreinfo').css('top', pos.top + 100);
    $('#div_moreinfo').css('left', pos.left - 120);

    $('#' + appInfoObj.domId + ' .lui-icon--info').on('mouseout', function () {
        $('.apphoverinfo').remove();
    });
}


function getApps(settings) {


    // if (!streamId) streamId = $('#select_stream').find(":selected").val();
    console.log('getApps');
    updateAppCounter('<span class="lui-icon">£</span>');
    $('#applist-' + global.viewMode).empty();

    qrsAPI(
        'GET',
        '/qrs/app/full', //+ (streamId == '.*' ? '' : '?filter=stream.id eq ' + streamId),
        global, true
    ).then(res => {
        if (settings.browserConsoleLog) console.log('qrs applist', res);
        res.forEach(app => {
            // $("#applist").append(
            createAppIcon({ // app icon from QRS reply
                appId: app.id,
                domId: app.id,
                appName: app.name,
                owner: app.owner.userDirectory + '\\' + app.owner.userId,
                created: app.createdDate.split('.')[0].replace('T', ' '),
                stream: app.published ? app.stream.name : 'Personal',
                // tagList: '',
                streamId: app.stream ? app.stream.id : 'Personal',
                link: global.baseUrl + '/sense/app/' + app.id,
                thumbnail: app.thumbnail ? app.thumbnail : null,
                source: 'internal',
                styleCloudIcon: 'display:none;'  // do not display cloud icon
            },
                isAppVisible(app.name, app.stream ? app.stream.id : 'Personal', 'internal')
            );
        })
        updateAppCounter();
        sortAppList();
        $('#refresh').removeClass('d-none');
    });

    if (global.userCloud) {
        qlikCloudLoopData(
            '/api/v1/items?resourceType=app&limit=100', //+ (streamId == '.*' ? '' : '&spaceId=' + streamId),
            settings,
            function (app) {
                // $("#applist").append(
                createAppIcon({  // app icon from Cloud API response
                    appId: app.resourceId,
                    domId: app.id,
                    appName: app.name,
                    owner: global.cloudCache.users[app.ownerId] || app.ownerId,
                    created: app.createdAt.replace('Z', '').replace('T', ' '),
                    stream: global.cloudCache.spaces[app.spaceId] || app.spaceId,
                    streamId: app.spaceId || 'Personal',
                    //tagList: '',
                    link: settings.qlikCloudUrl + '/sense/app/' + app.resourceId,
                    thumbnail: app.thumbnailId ? settings.qlikCloudUrl + app.thumbnailId : null,
                    source: 'cloud',
                    styleCloudIcon: '' // shows the cloud icon 
                },
                    isAppVisible(app.name, app.spaceId || 'Personal', 'cloud')
                );
            }
        );

        updateAppCounter();
        sortAppList();
    }

    $('#btn_loadapps').removeAttr('disabled');
}

function updateAppCounter(content = '') {

    const counter = $('.hh-app-' + global.viewMode + ':visible').length;
    $('#appcounter').html(
        content || ('(' + counter + ')')
    );
    if (!content && counter == 0) {
        $('#zero-apps').show();
    } else {
        $('#zero-apps').hide();
    }

}

function sortAppList() {

    $(".hh-app-" + global.viewMode).sort(function (a, b) {
        return ($(b).text()) < ($(a).text()) ? 1 : -1;
    }).appendTo('#applist-' + global.viewMode);
}


function whoAmIOnWindows() {
    $.ajax({
        type: 'GET',
        url: global.baseUrl + '/qps/user'
    })
        .then(function (res) {

            global.userWin = res.userDirectory + '\\' + res.userId;
            $('#whoami-win').html(global.userWin);

            // has the user any admin roles?
            qrsAPI(
                'GET',
                "/qrs/user/full?filter=userId eq '" + global.userWin.split('\\')[1] + "' and userDirectory eq '" + global.userWin.split('\\')[0] + "'",
                global,
                true
            ).then(function (qrsUserInfo) {
                global.userWinRoles = qrsUserInfo[0].roles;

                if (global.userWinRoles.indexOf('RootAdmin') > -1 || global.userWinRoles.indexOf('ContentAdmin') > -1) {
                    $('#btn_settings').show();
                }
            });
        });
}

function isAppVisible(appName, stream = '', source) {
    const ret = appName.match(global.filters.regexSearch) != null
        && stream.match(global.filters.regexStream) != null
        && source.match(global.filters.regexSource) != null;
    return ret
}

function filterAppList() {
    // console.log('searchTxt', searchTxt);

    $(".hh-app-" + global.viewMode).each(function (appIcon) {
        if (isAppVisible($(this).attr('data-name'), $(this).attr('data-streamid'), $(this).attr('data-source'))) {
            $(this).show();
        } else {
            $(this).hide();
        }
    });
    updateAppCounter();
}

function editSettings(settings) {

    $('#settings_form').empty();
    Object.entries(settings).forEach(function (keyValue) {
        if (typeof (keyValue[1]) != 'boolean') {
            $('#settings_form').append(`
                <div class="mb-3">
                      <label for="${keyValue[0]}" class="col-form-label">${keyValue[0]}</label>
                      <input type="text" class="form-control  form-control-sm" id="${keyValue[0]}" value="${keyValue[1]}">
                </div>
            `);
        } else {
            $('#settings_form').append(`
                <div class="form-check">
                    <input class="form-check-input" type="checkbox" value="" id="${keyValue[0]}" ${keyValue[1] ? 'checked' : ''}>
                    <label class="form-check-label" for="${keyValue[0]}">${keyValue[0]}</label>
                </div>
            `);
        }
    });

    $('#btn-save-settings').on('click', async function () {
        // Save settings
        var newJson = {};
        console.log('Saving settings');
        $('#settings_form input').each(function (i) {
            if (this.type == 'checkbox')
                newJson[this.id] = this.checked;
            else
                newJson[this.id] = this.value;
        });
        console.log('new settings', newJson);


        // const res = functions.qrsCall('POST', global.qrsUrl + 'ContentLibrary/Default/uploadfile'
        //     + '?externalpath=' + settingsFile + '&overwrite=true', httpHeader, JSON.stringify(newJson));
        await qrsAPI(
            'POST',
            '/qrs/ContentLibrary/Default/uploadfile?externalpath=' + settingsFile + '&overwrite=true',
            global,
            false,
            JSON.stringify(newJson)
        )
        location.href = location.origin + location.pathname; // reload the page
    });
}

function createSettings() {
    $('#open-setup').trigger('click');

    qrsAPI(
        'POST',
        '/qrs/ContentLibrary/Default/uploadfile?externalpath=' + settingsFile,
        global,
        true,
        JSON.stringify(defaultSettings)
    ).then(function (res) {
        $('#settings-success').removeClass('d-none');
    }).catch(function (err) {
        $('#settings-error').removeClass('d-none');
    });
}

function replaceDoubleCurlyBrackets(text, replacers) {
    // returns the text with all existances of {{such_syntax}} are replaced with the
    // content of replacers.such_syntax. All keys in replacers abject are searched/replaced in text
    var ret = text;
    if (ret) {
        for (const substring in replacers) {
            ret = ret.replace(new RegExp('{{' + substring + '}}', 'g'), replacers[substring]);
        }
    } else {
        console.error('text empty', ret);
    }
    return ret
}

function getCloudUsers(settings) {
    // get list of users and cache it
    global.cloudCache.users = {}; // empty spaces object in cloudCache 
    qlikCloudLoopData('/api/v1/users?limit=100', settings, function (user) {
        global.cloudCache.users[user.id] = user.name; // add user to cloudCache
    });
    // console.warn('cloud users', global.cloudCache.users);
}
