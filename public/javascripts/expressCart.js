/* eslint-disable prefer-arrow-callback, no-var, no-tabs */
/* globals showNotification, numeral, feather */
$(document).ready(function () {

    // Parse url for filters
    function addParameter(url, parameterName, parameterValue){
        replaceDuplicates = true;
        if(url.indexOf('#') > 0){
            var cl = url.indexOf('#');
            urlhash = url.substring(url.indexOf('#'),url.length);
        } else {
            urlhash = '';
            cl = url.length;
        }
        sourceUrl = url.substring(0,cl);
    
        var urlParts = sourceUrl.split("?");
        var newQueryString = "";
    
        if (urlParts.length > 1)
        {
            var filterType = urlParts[1].split('&');
            if(filterType.length > 1){
                if(parameterName == "filter"){
                    newQueryString = "?"+filterType[0] + "_" + parameterValue +"&"+ filterType[1];
                }
                else{
                    newQueryString = "?"+filterType[0]  + "&" + parameterName+"="+parameterValue;
                }
            }
            else{
                if(parameterName == filterType[0].split('=')[0] && parameterName == "filter"){
                    newQueryString = "?"+filterType[0] + "_" + parameterValue;
                }
                else if(parameterName == filterType[0].split('=')[0]){
                    newQueryString = "?"+parameterName + "=" + parameterValue;
                }
                else if(parameterName == "filter"){
                    newQueryString = "?"+parameterName + "=" + parameterValue+"&"+urlParts[1];
                }
                else{
                    newQueryString = "?"+urlParts[1] + "&" + parameterName+"="+parameterValue;
                }
            }
        }
        else{
            newQueryString = "?" + parameterName + "=" + parameterValue;
        }
        
        return urlParts[0] + newQueryString + urlhash;
    };

    function removeParameter(url, parameterValue){
        replaceDuplicates = true;
        if(url.indexOf('#') > 0){
            var cl = url.indexOf('#');
            urlhash = url.substring(url.indexOf('#'),url.length);
        } else {
            urlhash = '';
            cl = url.length;
        }
        sourceUrl = url.substring(0,cl);
    
        var urlParts = sourceUrl.split("?");
        var newQueryString = "";
    
        if (urlParts.length > 1)
        {
            var multifilter = urlParts[1].split('&');
            if(multifilter.length > 1){
                var values = multifilter[0].split('=')[1].split('_');
                var index = values.indexOf(parameterValue);
                values.splice(index, 1);
                if(values.length != 0)
                {
                    newQueryString = "?filter="+ values.join('_')+"&"+multifilter[1];
                }
                else{
                    newQueryString = "?"+ multifilter[1];
                }
            }
            else{
                var values = urlParts[1].split('=')[1].split('_');
                var index = values.indexOf(parameterValue);
                values.splice(index, 1);
                if(values.length != 0)
                newQueryString = "?filter="+ values.join('_');
            }
        }

    
        return urlParts[0] + newQueryString + urlhash;
    };

    if ($(window).width() < 768) {
        $('.menu-side').on('click', function (e) {
            e.preventDefault();
            $('.menu-side li:not(".active")').slideToggle();
        });

        $('.menu-side li:not(".active")').hide();
        $('.menu-side>.active').html('<i class="feather" data-feather="menu"></i>');
        $('.menu-side>.active').addClass('menu-side-mobile');

        // hide menu if there are no items in it
        if ($('#navbar ul li').length === 0) {
            $('#navbar').hide();
        }

        $('#offcanvasClose').hide();
    }

    $('#userSetupForm').validator().on('submit', function (e) {
        if (!e.isDefaultPrevented()) {
            e.preventDefault();
            $.ajax({
                    method: 'POST',
                    url: '/admin/setup_action',
                    data: {
                        usersName: $('#usersName').val(),
                        userEmail: $('#userEmail').val(),
                        userPassword: $('#userPassword').val()
                    }
                })
                .done(function (msg) {
                    showNotification(msg.message, 'success', false, '/admin/login');
                })
                .fail(function (msg) {
                    showNotification(msg.responseJSON.message, 'danger');
                });
        }
    });

    $(document).on('click', '.menu-btn', function (e) {
        e.preventDefault();
        $('body').addClass('pushy-open-right');
    });

    // add the table class to all tables
    $('table').each(function () {
        $(this).addClass('table table-hover');
    });

    if ($('#productTags').length) {
        $('#productTags').tokenfield();
    }
    if ($('#productpackList').length) {
        $('#productpackList').tokenfield();
    }
    $(document).on('click', '.dashboard_list', function (e) {
        window.document.location = $(this).attr('href');
    }).hover(function () {
        $(this).toggleClass('hover');
    });

    $(document).on('click', '.btn-qty-minus', function (e) {
        e.preventDefault();
        var qtyElement = $(e.target).parent().parent().find('.cart-product-quantity');
        $(qtyElement).val(parseInt(qtyElement.val()) - 1);
        cartUpdate(qtyElement);
    });

    $(document).on('click', '.btn-qty-add', function (e) {
        e.preventDefault();
        var qtyElement = $(e.target).parent().parent().find('.cart-product-quantity');
        $(qtyElement).val(parseInt(qtyElement.val()) + 1);
        cartUpdate(qtyElement);
    });

    $(document).on('click', '.btn-delete-from-cart', function (e) {
        deleteFromCart($(e.target));
    });

    if ($('#pager').length) {
        var pageNum = $('#pageNum').val();
        var pageLen = $('#itemsPerPage').val();
        var itemCount = $('#totalItemCount').val();
        var paginateUrl = $('#paginateUrl').val();
        var searchTerm = $('#searchTerm').val();

        if (searchTerm !== '') {
            searchTerm = searchTerm + '/';
        }

        var pagerHref = '/' + paginateUrl + '/' + searchTerm + '{{number}}';
        var totalItems = Math.ceil(itemCount / pageLen);

        if (parseInt(itemCount) > parseInt(pageLen)) {
            $('#pager').bootpag({
                total: totalItems,
                page: pageNum,
                maxVisible: 5,
                href: pagerHref,
                wrapClass: 'pagination',
                prevClass: 'page-item previous',
                nextClass: 'page-item next',
                activeClass: 'page-item active'
            });

            // Fix for Bootstrap 4
            $('#pager a').each(function () {
                $(this).addClass('page-link');
            });
        }
    }

    $('#customerLogout').on('click', function (e) {
        $.ajax({
                method: 'POST',
                url: '/customer/logout',
                data: {}
            })
            .done(function (msg) {
                location.reload();
            });
    });
    $('#checkavailable').keyup(function(e){
        if($(this).val().length == 6){
            e.preventDefault();
            var pincode = $('#checkavailable').val();
            $.ajax({
                method: 'POST',
                url: '/product/pinavailability',
                data: {
                    pincode: pincode
                }
            })
            .done(function(msg){
                $('#displayavailable').text("Available");
                $('#displayavailable').addClass('text-success');
                $('#displayavailable').removeClass('text-danger');
                showNotification(msg.message, 'success');
            })
            .fail(function(msg){
                $('#displayavailable').text("Not Available");
                $('#displayavailable').addClass('text-danger');
                $('#displayavailable').removeClass('text-success');
                showNotification(msg.responseText, 'danger');
            });
        }
    });
    $('#shipPostcode').focusout(function(e){
        e.preventDefault();
        var pincode = $(this).val();
        $.ajax({
            method: 'POST',
            url: '/product/pinavailability',
            data: {
                pincode: pincode
            }
        })
        .done(function(msg){
            $('#shipState').val("Delhi");
            $('#shipState').attr('disabled','true');
            showNotification(msg.message, 'success');
        })
        .fail(function(msg){
            $('#shipState').val("Change PinCode");
            $('#shipState').attr('disabled','true');
            showNotification(msg.responseText, 'danger');
        });
    });
    $('#customerForgotten').validator().on('submit', function (e) {
        if (!e.isDefaultPrevented()) {
            e.preventDefault();
            $.ajax({
                    method: 'POST',
                    url: '/customer/forgotten_action',
                    data: {
                        email: $('#recover-email').val()
                    }
                })
                .done(function (msg) {
                    showNotification(msg.message, 'success');
                })
                .fail(function (msg) {
                    if (msg.message) {
                        showNotification(msg.responseJSON.message, 'danger');
                        return;
                    }
                    showNotification(msg.responseText, 'danger');
                });
        }
    });

    $('.expand-filter').on('click',function(){
        $('.filter').toggleClass('displaynone');
    });
    // Apply Filters
    $('.applyfilters').validator().on('click', function (e) {
        if (!e.isDefaultPrevented()) {
            e.preventDefault();
            var id = $(this).val();
            var url = addParameter(window.location.href, 'filter', id);
            console.log(url);
            location.href = url;
        }
    });    
    // Remove Filter
    $('.removefilters').validator().on('click', function (e) {
        if (!e.isDefaultPrevented()) {
            e.preventDefault();
            var id = $(this).val();
            var url = removeParameter(window.location.href, id);
            console.log(url);
            location.href = url;
        }
    });  

    $(document).on('click', '#createAccountCheckbox', function (e) {
        $('#newCustomerPassword').prop('required', $('#createAccountCheckbox').prop('checked'));
    });

    $('#checkoutInformation').validator().on('click', function (e) {
        e.preventDefault();
        if ($('#shipping-form').validator('validate').has('.has-error').length === 0) {
            // Change route if customer to be saved for later
            var route = '/customer/save';
            if ($('#createAccountCheckbox').prop('checked')) {
                route = '/customer/create';
            }
            $.ajax({
                    method: 'POST',
                    url: route,
                    data: {
                        email: $('#shipEmail').val(),
                        company: $('#shipCompany').val(),
                        firstName: $('#shipFirstname').val(),
                        lastName: $('#shipLastname').val(),
                        address1: $('#shipAddr1').val(),
                        address2: $('#shipAddr2').val(),
                        country: $('#shipCountry').val(),
                        state: $('#shipState').val(),
                        postcode: $('#shipPostcode').val(),
                        phone: $('#shipPhoneNumber').val(),
                        password: $('#newCustomerPassword').val(),
                        orderComment: $('#orderComment').val()
                    }
                })
                .done(function () {
                    window.location = '/checkout/shipping';
                })
                .fail(function (msg) {
                    showNotification(msg.responseJSON.message, 'danger');
                });
        }
    });

    $('#addDiscountCode').on('click', function (e) {
        e.preventDefault();
        $.ajax({
                method: 'POST',
                url: '/checkout/adddiscountcode',
                data: {
                    discountCode: $('#discountCode').val()
                }
            })
            .done(function (msg) {
                showNotification(msg.message, 'success', true);
            })
            .fail(function (msg) {
                showNotification(msg.responseJSON.message, 'danger');
            });
    });

    $('.removepromocode').on('click', function (e) {
        e.preventDefault();
        $.ajax({
                method: 'POST',
                url: '/checkout/removediscountcode',
                data: {}
            })
            .done(function (msg) {
                showNotification(msg.message, 'success', true);
            })
            .fail(function (msg) {
                showNotification(msg.responseJSON.message, 'danger');
            });
    });

    $('#adminloginForm').on('click', function (e) {
        if (!e.isDefaultPrevented()) {
            e.preventDefault();
            $.ajax({
                    method: 'POST',
                    url: '/admin/login_action',
                    data: {
                        adminemail: document.getElementById("adminemail").value,
                        adminpassword: document.getElementById("adminpassword").value
                    }
                })
                .done(function (msg) {
                    window.location = '/admin';
                })
                .fail(function (msg) {
                    showNotification(msg.responseJSON.message, 'danger');
                });
        }
        e.preventDefault();
    });

    $('#customerloginForm').on('click', function (e) {
        if (!e.isDefaultPrevented()) {
            e.preventDefault();
            $.ajax({
                    method: 'POST',
                    url: '/customer/login_action',
                    data: {
                        loginEmail: $('#email').val(),
                        loginPassword: $('#password').val()
                    }
                })
                .done(function (msg) {
                    window.location = '/customer/account';
                })
                .fail(function (msg) {
                    showNotification(msg.responseJSON.message, 'danger');
                });
        }
        e.preventDefault();
    });
    $('#customerloginForm2').on('click', function (e) {
        if (!e.isDefaultPrevented()) {
            e.preventDefault();
            $.ajax({
                    method: 'POST',
                    url: '/customer/login_action',
                    data: {
                        loginEmail: $('#email2').val(),
                        loginPassword: $('#password2').val()
                    }
                })
                .done(function (msg) {
                    window.location = '/customer/account';
                })
                .fail(function (msg) {
                    showNotification(msg.responseJSON.message, 'danger');
                });
        }
        e.preventDefault();
    });

    // call update settings API
    $('#customerLogin').on('click', function (e) {
        if (!e.isDefaultPrevented()) {
            e.preventDefault();
            $.ajax({
                    method: 'POST',
                    url: '/customer/login_action',
                    data: {
                        loginEmail: $('#customerLoginEmail').val(),
                        loginPassword: $('#customerLoginPassword').val()
                    }
                })
                .done(function (msg) {
                    var customer = msg.customer;
                    // Fill in customer form
                    $('#shipEmail').val(customer.email);
                    $('#shipFirstname').val(customer.firstName);
                    $('#shipLastname').val(customer.lastName);
                    $('#shipAddr1').val(customer.address1);
                    $('#shipAddr2').val(customer.address2);
                    $('#shipCountry').val(customer.country);
                    $('#shipState').val(customer.state);
                    $('#shipPostcode').val(customer.postcode);
                    $('#shipPhoneNumber').val(customer.phone);
                    location.reload();
                })
                .fail(function (msg) {
                    showNotification(msg.responseJSON.message, 'danger');
                });
        }
        e.preventDefault();
    });

    // Customer saving own details
    $('#customerSave').validator().on('click', function (e) {
        e.preventDefault();
        if ($('#customer-form').validator('validate').has('.has-error').length === 0) {
            $.ajax({
                    method: 'POST',
                    url: '/customer/update',
                    data: {
                        email: $('#shipEmail').val(),
                        firstName: $('#shipFirstname').val(),
                        lastName: $('#shipLastname').val(),
                        address1: $('#shipAddr1').val(),
                        country: $('#shipCountry').val(),
                        state: $('#shipState').val(),
                        postcode: $('#shipPostcode').val(),
                        phone: $('#shipPhoneNumber').val(),
                        password: $('#newCustomerPassword').val(),
                        orderComment: $('#orderComment').val()
                    }
                })
                .done(function () {
                    showNotification('Details saved', 'success');
                })
                .fail(function (msg) {
                    showNotification(msg.responseJSON.message, 'danger');
                });
        }
    });

    // Address saving
    $('#addressSave').validator().on('click', function (e) {
        e.preventDefault();
        if ($('#customer-form').validator('validate').has('.has-error').length === 0) {
            $.ajax({
                    method: 'POST',
                    url: '/customer/update',
                    data: {
                        email: $('#shipEmail').val(),
                        firstName: $('#shipFirstname').val(),
                        lastName: $('#shipLastname').val(),
                        address1: $('#shipAddr1').val(),
                        country: $('#shipCountry').val(),
                        state: $('#shipState').val(),
                        postcode: $('#shipPostcode').val(),
                        phone: $('#shipPhoneNumber').val(),
                        password: $('#newCustomerPassword').val(),
                        orderComment: $('#orderComment').val()
                    }
                })
                .done(function () {
                    showNotification('Address Saved', 'success');
                })
                .fail(function (msg) {
                    showNotification(msg.responseJSON.message, 'danger');
                });
        }
    });

    // Customer saving Password
    $('#passwordSave').validator().on('click', function (e) {
        e.preventDefault();
        if ($('#customer-form').validator('validate').has('.has-error').length === 0) {
            $.ajax({
                    method: 'POST',
                    url: '/customer/update',
                    data: {
                        email: $('#shipEmail').val(),
                        firstName: $('#shipFirstname').val(),
                        lastName: $('#shipLastname').val(),
                        address1: $('#shipAddr1').val(),
                        country: $('#shipCountry').val(),
                        state: $('#shipState').val(),
                        postcode: $('#shipPostcode').val(),
                        phone: $('#shipPhoneNumber').val(),
                        password1: $('#newCustomerPassword1').val(),
                        password: $('#newCustomerPassword').val(),
                        orderComment: $('#orderComment').val()
                    }
                })
                .done(function () {
                    showNotification('Password Saved', 'success');
                })
                .fail(function (msg) {
                    showNotification(msg.responseJSON.message, 'danger');
                });
        }
    });

    $(document).on('click', '.image-next', function (e) {
        var thumbnails = $('.thumbnail-image');
        var index = 0;
        var matchedIndex = 0;

        // get the current src image and go to the next one
        $('.thumbnail-image').each(function () {
            if ($('#product-title-image').attr('src') === $(this).attr('src')) {
                if (index + 1 === thumbnails.length || index + 1 < 0) {
                    matchedIndex = 0;
                } else {
                    matchedIndex = index + 1;
                }
            }
            index++;
        });

        // set the image src
        $('#product-title-image').attr('src', $(thumbnails).eq(matchedIndex).attr('src'));
    });

    $(document).on('click', '.image-prev', function (e) {
        var thumbnails = $('.thumbnail-image');
        var index = 0;
        var matchedIndex = 0;

        // get the current src image and go to the next one
        $('.thumbnail-image').each(function () {
            if ($('#product-title-image').attr('src') === $(this).attr('src')) {
                if (index - 1 === thumbnails.length || index - 1 < 0) {
                    matchedIndex = thumbnails.length - 1;
                } else {
                    matchedIndex = index - 1;
                }
            }
            index++;
        });

        // set the image src
        $('#product-title-image').attr('src', $(thumbnails).eq(matchedIndex).attr('src'));
    });

    $(document).on('change', '#product_variant', function (e) {
        var variantPrice = $(this).find(':selected').attr('data-price');
        var currencySymbol = $('#currencySymbol').val();
        $('h4.product-price:first').html(currencySymbol + variantPrice);
    });

    $(document).on('click', '.btn-round', function (e) {
        $.ajax({
                method: 'POST',
                url: '/product/addtocart',
                data: {
                    productId: $(this).attr('data-id'),
                    productQuantity: '1',
                    productVariant: $('#productVariant-' + $(this).attr('data-id')).val()
                }
            })
            .done(function (msg) {
                updateCartDiv();
                showNotification(msg.message, 'success');
            })
            .fail(function (msg) {
                showNotification(msg.responseJSON.message, 'danger');
            });
    });
    $(document).on('click', '.add-variant-to-cart', function (e) {
        $.ajax({
                method: 'POST',
                url: '/product/addtocart',
                data: {
                    productId: $(this).attr('data-id'),
                    productQuantity: '1',
                    productVariant: $('#productVariant-' + $(this).attr('data-id')).val()
                }
            })
            .done(function (msg) {
                updateCartDiv();
                showNotification(msg.message, 'success');
            })
            .fail(function (msg) {
                showNotification(msg.responseJSON.message, 'danger');
            });
    });

    $(document).on('click', '.product-add-to-cart', function (e) {
        if (parseInt($('#product_quantity').val()) < 1) {
            $('#product_quantity').val(1);
        }

        $.ajax({
                method: 'POST',
                url: '/product/addtocart',
                data: {
                    productId: $('#productId').val(),
                    productQuantity: $('#product_quantity').val(),
                    productVariant: $('#product_variant').val(),
                    productComment: $('#product_comment').val()
                }
            })
            .done(function (msg) {
                updateCartDiv();
                showNotification(msg.message, 'success');
            })
            .fail(function (msg) {
                showNotification(msg.responseJSON.message, 'danger');
            });
    });



    $('#product_quantity').on('keyup', function (e) {
        checkMaxQuantity(e, $('#product_quantity'));
    });

    $('.cart-product-quantity').on('keyup', function (e) {
        checkMaxQuantity(e, $('.cart-product-quantity'));
    });

    $('.cart-product-quantity').on('focusout', function (e) {
        cartUpdate($(e.target));
    });

    $(document).on('click', '.pushy-link', function (e) {
        $('body').removeClass('pushy-open-right');
    });

    $(document).on('click', '.add-to-cart', function (e) {
        var productLink = '/product/' + $(this).attr('data-id');
        if ($(this).attr('data-link')) {
            productLink = '/product/' + $(this).attr('data-link');
        }

        if ($(this).attr('data-has-variants') === 'true') {
            window.location = productLink;
        } else {
            $.ajax({
                    method: 'POST',
                    url: '/product/addtocart',
                    data: {
                        productId: $(this).attr('data-id')
                    }
                })
                .done(function (msg) {
                    updateCartDiv();
                    showNotification(msg.message, 'success');
                })
                .fail(function (msg) {
                    showNotification(msg.responseJSON.message, 'danger');
                });
        }
    });

    // On empty cart click
    $(document).on('click', '#empty-cart', function (e) {
        $('#confirmModal').modal('show');
        $('#buttonConfirm').attr('data-func', 'emptyCart');
    });

    $(document).on('click', '#buttonConfirm', function (e) {
        // Get the function and run it
        var func = $(e.target).attr('data-func');
        window[func]();
        $('#confirmModal').modal('hide');
    });

    $('.qty-btn-minus').on('click', function () {
        var number = parseInt($('#product_quantity').val()) - 1;
        $('#product_quantity').val(number > 0 ? number : 1);
    });

    $('.qty-btn-plus').on('click', function () {
        $('#product_quantity').val(parseInt($('#product_quantity').val()) + 1);
    });

    // product thumbnail image click
    $('.thumbnail-image').on('click', function () {
        $('#product-title-image').attr('src', $(this).attr('src'));
    });

    // resets the order filter
    $(document).on('click', '#btn_search_reset', function (e) {
        window.location.replace('/');
    });

    // search button click event
    $(document).on('click', '#btn_search', function (e) {
        e.preventDefault();
        if ($('#frm_search').val().trim() === '') {
            showNotification('Please enter a search value', 'danger');
        } else {
            window.location.href = '/search/' + $('#frm_search').val();
        }
    });

    if ($('#input_notify_message').val() !== '') {
        // save values from inputs
        var messageVal = $('#input_notify_message').val();
        var messageTypeVal = $('#input_notify_messageType').val();

        // clear inputs
        $('#input_notify_message').val('');
        $('#input_notify_messageType').val('');

        // alert
        showNotification(messageVal, messageTypeVal || 'danger', false);
    }

    // checkout-blockonomics page (blockonomics_payment route) handling START ***
    if ($('#blockonomics_div').length > 0) {
        var orderid = $('#blockonomics_div').data('orderid') || '';
        var timestamp = $('#blockonomics_div').data('timestamp') || -1;
        var address = $('#blockonomics_div').data('address') || '';
        var blSocket = new WebSocket('wss://www.blockonomics.co/payment/' + address + '?timestamp=' + timestamp);
        blSocket.onopen = function (msg) {};
        var timeOutMinutes = 10;
        setTimeout(function () {
            $('#blockonomics_waiting').html('<b>Payment expired</b><br><br><b><a href=\'/checkout/payment\'>Click here</a></b> to try again.<br><br>If you already paid, your order will be processed automatically.');
            showNotification('Payment expired', 'danger');
            blSocket.close();
        }, 1000 * 60 * timeOutMinutes);

        var countdownel = $('#blockonomics_timeout');
        var endDatebl = new Date((new Date()).getTime() + 1000 * 60 * timeOutMinutes);
        var blcountdown = setInterval(function () {
            var now = new Date().getTime();
            var distance = endDatebl - now;
            if (distance < 0) {
                clearInterval(blcountdown);
                return;
            }
            var minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
            var seconds = Math.floor((distance % (1000 * 60)) / 1000);
            countdownel.html(minutes + 'm ' + seconds + 's');
        }, 1000);

        blSocket.onmessage = function (msg) {
            var data = JSON.parse(msg.data);
            if ((data.status === 0) || (data.status === 1) || (data.status === 2)) {
                // redirect to order confirmation page
                var orderMessage = '<br>View <b><a href="/payment/' + orderid + '">Order</a></b>';
                $('#blockonomics_waiting').html('Payment detected (<b>' + data.value / 1e8 + ' BTC</b>).' + orderMessage);
                showNotification('Payment detected', 'success');
                $('#cart-count').html('0');
                blSocket.close();
                $.ajax({
                    method: 'POST',
                    url: '/product/emptycart'
                }).done(function () {
                    window.location.replace('/payment/' + orderid);
                });
            }
        };
    }
    // checkout-blockonomics page (blockonomics_payment route) handling ***  END
});

function checkMaxQuantity(e, element) {
    if ($('#maxQuantity').length) {
        if (e.keyCode === 46 || e.keyCode === 8) {
            return;
        }
        if (parseInt($(e.target).val()) > parseInt($('#maxQuantity').val())) {
            const qty = element.val();
            e.preventDefault();
            element.val(qty.slice(0, -1));
            showNotification(`Exceeds maximum quantity: ${$('#maxQuantity').val()}`, 'warning', false);
        }
    }
}

function deleteFromCart(element) {
    $.ajax({
            method: 'POST',
            url: '/product/removefromcart',
            data: {
                cartId: element.attr('data-cartid')
            }
        })
        .done(function (msg) {
            updateCartDiv();
            showNotification(msg.message, 'success');
        })
        .fail(function (msg) {
            showNotification(msg.responseJSON.message, 'danger');
        });
}

function cartUpdate(element) {
    if ($(element).val() > 0) {
        if ($(element).val() !== '') {
            updateCart(element);
        }
    } else {
        $(element).val(1);
    }
}

function updateCart(element) {
    // update cart on server
    $.ajax({
            method: 'POST',
            url: '/product/updatecart',
            data: {
                cartId: element.attr('data-cartid'),
                productId: element.attr('data-id'),
                quantity: element.val()
            }
        })
        .done(function (msg) {
            updateCartDiv();
        })
        .fail(function (msg) {
            showNotification(msg.responseJSON.message, 'danger', true);
        });
}
function updateCartDiv() {
    $.ajax({
            method: 'GET',
            url: '/checkout/cartdata'
        })
        .done(function (result) {
            // Update the cart div
            showNotification("Succesfully Updated the Cart", 'success');
            window.location.reload();
        })
        .fail(function (result) {
            showNotification(result.responseJSON.message, 'danger');
        });
}

// eslint-disable-next-line no-unused-vars
function emptyCart() {
    $.ajax({
            method: 'POST',
            url: '/product/emptycart'
        })
        .done(function (msg) {
            updateCartDiv();
            showNotification(msg.message, 'success', true);
        });
}