/* 
Sales Order Engine
-----------------------------------------------------------------------------------
Written by: Joshua Bruce  

NetSuite Information
-----------------------------------------------------------------------------------
Libraries:        __scriptTiming.js__  

Version History
-----------------------------------------------------------------------------------
*/


/* 	================================================================== DEBUG SWITCH 
	Setting this to true will output DEBUG statements into the script execution log
=================================================================================== */
var DEBUG = true;


/* 	================================================================ HOAH CONSTANTS 
	Hard-coded limits set by HOAH.
=================================================================================== */

var TOTALTHRESHOLD = 1500;
var POBOXTHRESHOLD = 149;
var EMAILTHRESHOLD = 1000;
var SPLITTHRESHOLD = 70;
var STOCKTHRESHOLD = 35;
var DROPSHIP_LIMIT = 100;
var BACKORDERLIMIT = 500;
var ETAFUTURELIMIT = 60;


/* 	============================================================ NETSUITE CONSTANTS 
	Hard-coded references to values within NetSuite.  Should those values be
	changed, the corresponding constants should be changed within this section
=================================================================================== */

/* Order Statuses */
var PENDING_APPROVAL 	    = 'A';
var PENDING_FULFILLMENT	    = 'B';
var PARTIALLY_FULFILLED	    = 'D';
var PEND_BILL_PART_FILLED	= 'E';
var PENDING_STATUSES = [PENDING_APPROVAL,PENDING_FULFILLMENT,PARTIALLY_FULFILLED,PEND_BILL_PART_FILLED];


/* Custom Forms */
var CF_CHECKSONACCOUNT 	= '';
var CF_WWWORIGIN_PAID   = '';

/* Payment Methods */
var PM_CHECK 	= '2';
var PM_PAYPAL 	= '11';

/* Price Levels */
var PL_TRADE 	= '4';
var PL_ZTRADE 	= '11';
var PL_BASE		= '1';

/* Hold Reasons */
var HR_ON_MANUAL_HOLD 		= '15';

var	HR_AGER_AND_NON_GROUND	= '5';
var HR_INTL_AND_GROUND 	 	= '14';
var HR_OVERSOLD_SALE_ITEM	= '8';
var HR_NO_PAYMENT_AND_WEB	= '18';
var HR_INTRASTATE_DROP_SHIP = '19';

var HR_TRADE_AND_PROMO		= '6';
var HR_DISCOUNT_REQUEST		= '1';
var HR_FRAUD_CUSTOMER		= '10';
var HR_ESCALATED_CUSTOMER	= '9';
var HR_OVER_THRESHOLD 	 	= '11';

var HR_VAT_APPROVAL			= '3';
var HR_PO_BOX 				= '4';
var HR_CVV_CHECK_FAILED 	= '2';
var HR_CREDIT_CARD			= '2';
var HR_ANTIQUE_ITEM			= '12';
var HR_SALES_NOTES 			= '13';
var HR_CUSTOMER_COMMENTS	= '7';
var HR_PAY_BY_CHECK 		= '16';
var HR_CUSTOM_WORK			= '17';

var MANDATORY_HOLDS = [HR_AGER_AND_NON_GROUND,HR_INTL_AND_GROUND,HR_OVERSOLD_SALE_ITEM,HR_INTRASTATE_DROP_SHIP];
var MANAGER_HOLDS   = [HR_TRADE_AND_PROMO,HR_DISCOUNT_REQUEST,HR_FRAUD_CUSTOMER,HR_ESCALATED_CUSTOMER,HR_OVER_THRESHOLD];


/* Stock Types */
var ITEMTYPE_STOCK		= '1';
var ITEMTYPE_CROSSDOCK	= '2';
var ITEMTYPE_DS			= '3';
var ITEMTYPE_IMPORT		= '4';
var ITEMTYPE_ANTIQUE	= '5';
var ITEMTYPE_SALE		= '6';
var ITEMTYPE_OVERSTOCK	= '7';

/* Item Types */
var ITEM_INVENTORY = 'inventoryitem';
var ITEM_KIT	   = 'kititem';
var ITEM_ASSEMBLY  = 'assemblyitem';
var ITEM_DISCOUNT  = 'discountitem';
var STOCKED_ITEMTYPES = [ITEM_INVENTORY,ITEM_KIT,ITEM_ASSEMBLY];

/* FOB Points */
var FOB_DROPSHIP 		= '1';
var FOB_STOCK 			= '2';
var FOB_SPECIALORDER 	= '3';
var FOB_STOCKDROP 		= '4';

/* Email Templates */
var ET_DROPSHIP_TEMPLATE	= 260;
var ET_SPLIT_TEMPLATE		= 259;
var ET_MULTIPLE_TEMPLATE	= 258;
var ET_SINGLE_TEMPLATE		= 257;

/* Email Results */
var ER_EMAIL_SENT			= 1;
var ER_NOT_ON_BACKORDER		= 2;
var ER_AMAZON_EMAIL			= 3;
var ER_ALL_DROPSHIP			= 4;
var ER_ETA_IN_TWO_DAYS		= 5;
var ER_NO_ETA_DATE			= 6;
var ER_ORDER_OVER_LIMIT		= 7;
var ER_ZERO_DOLLAR_LIMIT	= 8;
var ER_INTERNATIONAL_ORDER	= 9;
var ER_NO_EMAIL_ADDRESS		= 10;
var ER_KIT_ON_ORDER			= 12;
var ER_ETA_TODAY_OR_PAST	= 13;
var ER_EMAIL_SENT_SPLIT		= 14;
var ER_ETA_IN_FUTURE 	    = 15;



/* 	=============================================================== EXCEPTION LISTS 
	The sales order engine is determining what exceptions occur on each order, and
	generating lists of items and/or order-wide exceptions that need addressing.
=================================================================================== */
var ABH_List		= [];
var BO_List			= [];
var ETA_Dates		= [];
var ETA_Comments	= [];
var OnHold_Reasons	= [];


/* 	========================================================= ENVIRONMENT CONSTANTS 
	Hard-coded references to values within NetSuite.  Should those values be
	changed, the corresponding constants should be changed within this section
=================================================================================== */
var TODAY 			= new Date();
TODAY 				= nlapiStringToDate(nlapiDateToString(TODAY)); // reset to midnight
var MS_PER_DAY 		= 86400000;

var CONTEXT 		= nlapiGetContext();
var USER_ROLE		= CONTEXT.getRole();

var ROLE_SRVCE_MGR  = 1028;
var ROLE_SALES_MGR  = 1029;
var ROLE_PURCH_MGR	= 1002;
var ROLE_ACCTG_MGR  = 1000;
var ROLE_WEB_ADMIN  = 1015;
var ROLE_MIKE_M     = 1041;
var ROLE_JOSH_BRUCE = 1047;
var MANAGER_ROLES	= [ROLE_SRVCE_MGR,ROLE_SALES_MGR,ROLE_PURCH_MGR,ROLE_ACCTG_MGR,ROLE_WEB_ADMIN,ROLE_MIKE_M,ROLE_JOSH_BRUCE];
var IS_MANAGER		= MANAGER_ROLES.indexOf(USER_ROLE) > -1 ? true : false;
var ROLE_CANEDITSO	= CONTEXT.getPermission('TRAN_SALESORD') > 2 ? true : false;



var logSubject 		=  DEBUG ? 'Audit Report for ' + nlapiGetRecordId() : '';
var logMessage 		= '';






/* 	============================================================ SALES ORDER OBJECT 
	To reduce the amount of API calls on NetSuite, the Sales Order Engine creates
	its own Sales Order object that will load data from the NetSuite API for
	exception analysis.

	The Sales Order object has a number of methods made available for easy and
	readable exception analysis.
=================================================================================== */


function isEmpty(string) {
	if (!string) return true;
	return false;
}

function isPOBox(address) {
	poBox = /^ *((#\d+)|((box|bin)[-. \/\\]?\d+)|(.*p[ \.]? ?(o|0)[-. \/\\]? *-?((box|bin)|b|(#|num)?\d+))|(p(ost)? *(o(ff(ice)?)?)? *((box|bin)|b)? *\d+)|(p *-?\/?(o)? *-?box)|post office box|((box|bin)|b) *(number|num|#)? *\d+|(num|number|#) *\d+)/im
	if (address.search(poBox) !== -1) return true;
	return false;
}

function isOnHold() {
	if (this.onhold == 'T') return true;
	return false;
}

function isOnManualHold() {
	if (this.ohreasons.indexOf(HR_ON_MANUAL_HOLD) > -1) return true;
	return false;
}

function hasHoldNotes() {
	if (this.onholdnotes) return true;
	return false;
}

function isDiscountRequest() {
	if (this.ohreasons.indexOf(HR_DISCOUNT_REQUEST) > -1) return true;
	return false;
}

function isOverThreshold(threshold) {
	if(this.total > threshold) return true;
	return false;
}

function isZeroDollar() {
	if(this.total == 0) return true;
	return false;
}

function isAmazon() {
	if (this.storefront == 'Amazon') return true;
	return false;
}

function isPayPal() {
	if (this.paymethod == PM_PAYPAL) return true;
	return false;
}

function didCVVFail() {
	if (this.cvv_match == 'N' || this.cvv_match == 'X') return true;
	return false;
}

function isPayByCheck() {
	if (this.paymethod == PM_CHECK) return true;
	if (this.customform == CF_CHECKSONACCOUNT) return true;
	return false;
}

function hasComments() {
	if (!isEmpty(this.comments)) return true;
	return false;
}

function isShipToPOBox() {
	if (isPOBox(this.address)) return true;
	return false;
}

function isTradePricing() {
	//if (this.getPriceLevel() == PL_TRADE) return true;
	if (this.has_non_base_price) return true;
	return false;
}

function getPriceLevel() {
	if (!this.customer) return -1;
	return nlapiLookupField('customer',this.customer,'pricelevel');
}

function hasPromoCode() {
	if (this.promocode) return true;
	return false;
}

function isFraudCustomer() {	
	/*var filters = [];
	filters.push(new nlobjSearchFilter('internalid', null, 'is', this.customer));
	var results = nlapiSearchRecord('customer', 'customsearch_fraud_customers', filters, null);
	if (results) return true;*/
	return false;
}

function isEscalatedCustomer() {	
	var filters = [];
	filters.push(new nlobjSearchFilter('internalid', null, 'is', this.customer));
	var results = nlapiSearchRecord('customer', 'customsearch_escalated_customers', filters, null);
	if (results) return true;
	return false;
}

function hasCustomWork() {
	if (this.has_custom_items) return true;
	return false;
}

function hasSIItem() {
	if (this.has_si_items) return true;
	return false;
}

function hasSalesNotes() {
	if (this.has_sales_notes) return true;
	return false;
}

function hasGroundShipping() {
	return isGroundShipping(this.shipmethod);
}

function isInternational() {
	if (this.shipcountry == 'US') return false;
	return true;
}

function isWebOrder() {
	if (this.ordersource == 'Web') return true;
	return false;
}

function hasAgreedtoVATTerms() {
	if (this.vattermsagreed === 'T' || this.permanentvataccept === 'T') return true;
	return false;
}

function hasRejectedCard() {
	if (this.payholdreason == 'External Fraud Rejection' || this.payholdreason == 'External Fraud Review') return true;
	if ((this.avsstreetmatch == 'N' && this.avszipmatch == 'N') || (this.avsstreetmatch == 'X' && this.avszipmatch == 'X')) return true;
	return false;
}

function doFOBPoint() {
	if (this.has_specialorder) {
		this.fob_point = FOB_SPECIALORDER;
		return FOB_SPECIALORDER;
	} else if (this.has_dropship && this.has_stock) {
		this.fob_point = FOB_STOCKDROP;
		return FOB_STOCKDROP;
	} else if (this.has_dropship) {
		this.fob_point = FOB_DROPSHIP;
		return FOB_DROPSHIP;
	} else {
		this.fob_point = FOB_STOCK;
		return FOB_STOCK;
	}
		this.fob_point = FOB_STOCK;
	return FOB_STOCK;
}

function hasBackorder() {
	if (this.has_backorder) return true;
	return false;
}

function hasPossibleDropShip() {
	if (this.has_possible_dropship) return true;
	return false;
}

function hasDropShip() {
	if (this.has_dropship) return true;
	return false;
}

function hasSpecialOrder() {
	if (this.has_specialorder) return true;
	return false;
}

function hasKitsOrAssemblies() {
	if (this.has_kits_or_assemblies) return true;
	return false;
}

function hasABH() {
	if (this.has_abh_items) return true;
	return false;
}

function hasAger() {
	if (this.has_ager) return true;
	return false;
}

function hasAntique() {
	if (this.has_antique) return true;
	return false;
}

function hasOverSoldSaleItem() {
	if (this.has_oversold_sale_item) return true;
	return false;
}

function doBackOrderLines() {
	return this.list_backorder.join();
}

function doDropShipLines() {
	return this.list_dropship.join();
}

function doSpecialOrderLines() {
	return this.list_specialorder.join();
}

function doKitAssemblyLines() {
	return this.list_kits_or_assemblies.join();
}

function doABHLines() {
	return this.list_abh_items.join();
}

function hasOverride(holdreason) {
	if (this.overrides.indexOf(holdreason) != -1) return true;
	return false;
}

/*function removeOverride(holdreason) {
	var hr_index = this.overrides.indexOf(holdreason);
	nlapiLogExecution('DEBUG','ASSERT','Hold reason to remove: '+ hr_index);
	if (hr_index > -1) {
		this.overrides = this.overrides.splice(hr_index,1);
		return true;
	}
	return false;
}*/

function hasSentEmail() {
	if (this.emailresult) return true;
	return false;
}

function hasIntrastateDropShip() {
	if (this.ds_states.indexOf(this.shipstate) != -1) return true;
	return false;
}

function hasManualBackOrder() {
	return this.has_manual_bo;
}

function isOnPaymentHold() {
	if (this.payresult == 'Payment Hold') return true;
	return false;
}

function doAutoApproval() {
	//if (DEBUG) nlapiLogExecution('DEBUG','ASSERT doAutoApproval','Has DS: '+ this.has_dropship +', Has PDS:'+ this.has_possible_dropship+', Has KA:'+ this.has_kits_or_assemblies+', Order staus:'+this.orderstatus);
	if (this.has_dropship) return false;
	if (this.has_specialorder) return false;
	if (this.has_possible_dropship) return false;
	if (this.has_kits_or_assemblies) return false;
	if (this.orderstatus !== PENDING_APPROVAL) return false;
	return true;
}

function orderObject() {
	return this.order;
}

function orderId() {
	return this.order_id;
}



/* 	============================================================= LOAD COMPLEX DATA 
	The cornerstone of the Sales Order Engine, this method will iterate through the
	line items and perform analysis on drop ship items, back orders, kits & abh
	items and distill this information into true/false switches.
=================================================================================== */

function loadComplexData() {

	this.stockedtotal = 0;
	this.backorderedtotal = 0;
	this.has_stock = false;
	this.has_backorder = false;
	this.has_possible_dropship = false;
	this.has_dropship = false;
	this.has_specialorder = false;
	this.has_kits_or_assemblies = false;
	this.has_abh_items = false;
	this.has_ager = false;
	this.has_custom_items = false;
	this.has_si_items = false;
	this.has_sales_notes = false;
	this.has_oversold_sale_item = false;
	this.has_antique = false;
	this.has_non_base_price = false;
	this.list_backorder = [];
	this.list_dropship = [];
	this.list_specialorder = [];
	this.list_kits_or_assemblies = [];
	this.list_abh_items = [];

	var Vendor_BackOrders = [];
	var Vendor_Totals = new Object();

	this.ds_states = [];
	this.has_intrastate_ds = false;

	for (var line = 1; line <= this.line_item_count; line++) {
		var itemid 		= this.order.getLineItemValue('item','item',line);
		var itemnumber 	= this.order.getLineItemText('item','item',line);
		var itemnotes 	= this.order.getLineItemValue('item','custcol_sales_notes',line);
		var createpo 	= this.order.getLineItemValue('item','createpo',line);
		var lineamount  = Number(this.order.getLineItemValue('item','amount',line));
		var pricelevel  = this.order.getLineItemValue('item','price',line);

		var qty 		= this.order.getLineItemValue('item','quantity',line);
		var committed 	= this.order.getLineItemValue('item','quantitycommitted',line);
		if (committed == '') committed = 0;
		var fulfilled 	= this.order.getLineItemValue('item','quantityfulfilled',line);
		if (fulfilled == '') fulfilled = 0;
		var qty_needed  = qty-committed-fulfilled;

		var itemfields = [];
		itemfields.push('recordtype');
		itemfields.push('custitem_stock_type');
		itemfields.push('quantityavailable');
		itemfields.push('vendor');
		itemfields.push('vendor.custentity_vendor_dropship');
		var item = nlapiLookupField('item',itemid,itemfields);

		var stocktype = item.custitem_stock_type;
		var itemtype  = item.recordtype;
		var qtyavail  = Number(item.quantityavailable);
		var vendor 	  = item.vendor;
		var candrop	  = item['vendor.custentity_vendor_dropship'];
		candrop = candrop == 'T' ? true : false;
		if (stocktype === ITEMTYPE_IMPORT) candrop = false;

		//if (DEBUG) nlapiLogExecution('DEBUG','ASSERT loadComplexData',itemnumber+'Iventory type: '+ itemtype +', Stock Type:'+ stocktype);

		if (isAger(itemnumber)) 
			this.has_ager = true;

		if (isCustomWork(itemnumber))
			this.has_custom_items = true;

		if (isSIItem(itemnumber))
			this.has_si_items = true;

		if (!isEmpty(itemnotes))
			this.has_sales_notes = true;

		if (!isBasePrice(pricelevel) && itemtype !== ITEM_DISCOUNT)
			this.has_non_base_price = true;

		/* Ignore Antique, Sale Items */
		if (stocktype !== ITEMTYPE_ANTIQUE && stocktype !== ITEMTYPE_SALE && STOCKED_ITEMTYPES.indexOf(itemtype) > -1){
			if (createpo) {
				//if (DEBUG) nlapiLogExecution('DEBUG','ASSERT loadComplexData','Create PO: '+ createpo);
				if (createpo == 'DropShip') {
					this.has_dropship = true;
					this.list_dropship.push(line);
					var dsstates =  nlapiLookupField('vendor',vendor,'custentity_intrastate_drop_ships',true);
					if (dsstates) this.ds_states.push(dsstates);
				} else {
					this.has_specialorder = true;
					this.list_specialorder.push(line);
				}
			/*} else if (stocktype === ITEMTYPE_DS) {
				this.has_dropship = true;
				this.list_dropship.push(line);*/
			} else if (isABH(itemnumber) && itemtype === 'assemblyitem') {
				this.has_abh_items = true;
				this.has_stock = true;
				this.list_abh_items.push(line);
			} else if (itemtype === 'assemblyitem' || itemtype === 'kititem') {
				this.has_kits_or_assemblies = true;
				this.has_stock = true;
				this.list_kits_or_assemblies.push(line);
			} else if (qty_needed-qtyavail > 0) {
				this.has_backorder = true;
				this.has_stock = true;
				this.list_backorder.push(line);
				this.backorderedtotal += lineamount;
				if (candrop) Vendor_BackOrders.push(vendor);
			} else {
				this.has_stock = true;
				this.stockedtotal += lineamount;
			}
		} else {
			if (itemtype !== ITEM_DISCOUNT) this.stockedtotal += lineamount;
		}

		if (stocktype === ITEMTYPE_SALE && qty_needed-qtyavail > 0) {
			this.has_oversold_sale_item = true;
		}

		if (stocktype === ITEMTYPE_ANTIQUE) {
			this.has_antique = true;
		}
		
		if (vendor in Vendor_Totals) Vendor_Totals[vendor] += lineamount;
		else Vendor_Totals[vendor] = lineamount;
	}

	
	for (var v=0;v<Vendor_BackOrders.length;v++) {
		if (Vendor_Totals[Vendor_BackOrders[v]] > DROPSHIP_LIMIT) this.has_possible_dropship = true;
	} 

	if (this.isOverThreshold(BACKORDERLIMIT) && this.has_backorder) {
		this.has_possible_dropship = true;
	}

}


function SalesOrder(ns_OrderObject) {

	this.order 		= ns_OrderObject;
	this.orderstatus = ns_OrderObject.getFieldValue('orderstatus');
	if (this.orderstatus == null) this.orderstatus = PENDING_APPROVAL;
	this.order_id   = ns_OrderObject.getId();

	/* On-hold properties */
	this.onhold 	= ns_OrderObject.getFieldValue('custbody_on_hold');
	this.onholdnotes = ns_OrderObject.getFieldValue('custbody_onhold_notes');
	this.ohreasons  = ns_OrderObject.getFieldValues('custbody_onholdreason');
	if (!this.ohreasons) this.ohreasons = [];
	this.overrides	= ns_OrderObject.getFieldValues('custbody_override_hold_reasons');
	if (!this.overrides) this.overrides = [];

	/* Order properties used for On-Hold calculations */
	this.total 		= ns_OrderObject.getFieldValue('total');
	this.customform = ns_OrderObject.getFieldValue('customform');
	this.stockedtotal = ns_OrderObject.getFieldValue('custbody_stockedtotal');
	this.cvv_match 	= ns_OrderObject.getFieldValue('ccsecuritycodematch');
	this.comments 	= ns_OrderObject.getFieldValue('custbody_customer_comments');
	var shippingaddress	= ns_OrderObject.getFieldValue('shipaddress');
	this.address 	= shippingaddress ? fixAddress(shippingaddress) : ''; 
	this.paymethod 	= ns_OrderObject.getFieldValue('paymentmethod');
	this.payresult  = ns_OrderObject.getFieldText('paymenteventresult');
	this.storefront = ns_OrderObject.getFieldValue('custbody_storefront');
	this.promocode 	= ns_OrderObject.getFieldValue('promocode');
	this.customer 	= ns_OrderObject.getFieldValue('entity');
	this.shipmethod = ns_OrderObject.getFieldValue('shipmethod');
	this.billcountry = ns_OrderObject.getFieldValue('billcountry');
	this.shipcountry = ns_OrderObject.getFieldValue('shipcountry');
	if (!this.shipcountry) this.shipcountry = this.billcountry;
	this.shipstate = ns_OrderObject.getFieldValue('shipstate');
	this.ordersource = ns_OrderObject.getFieldValue('source');
	this.payholdreason = ns_OrderObject.getFieldText('paymenteventholdreason');
	this.avsstreetmatch = ns_OrderObject.getFieldValue('ccavsstreetmatch');
	this.avszipmatch = ns_OrderObject.getFieldValue('ccavszipmatch');
	this.vattermsagreed = ns_OrderObject.getFieldValue('custbody_vat_terms_agreed');
	this.permanentvataccept = ns_OrderObject.getFieldValue('custbody_intl_approval');
	this.fob_point = ns_OrderObject.getFieldValue('custbody_fob_point');

	/* Auto-Email properties */
	this.emailresult = ns_OrderObject.getFieldValue('custbody_email_result');
	this.email 		 = ns_OrderObject.getFieldValue('email');

	/* Item Exception properties */
	this.list_backorder = [];
	this.back_order_lines = ns_OrderObject.getFieldValue('custbody_backorder_lines');
	if (this.back_order_lines) this.list_backorder = this.back_order_lines.split(",");

	this.list_dropship = [];
	this.drop_ship_lines = ns_OrderObject.getFieldValue('custbody_dropship_lines');
	if (this.drop_ship_lines) this.list_dropship = this.drop_ship_lines.split(",");

	this.list_specialorder = [];
	this.specialorder_lines = ns_OrderObject.getFieldValue('custbody_specialorder_lines');
	if (this.specialorder_lines) this.list_specialorder = this.specialorder_lines.split(",");

	this.list_kits_or_assemblies = [];
	this.kit_assembly_lines = ns_OrderObject.getFieldValue('custbody_kit_assembly_lines');
	if (this.kit_assembly_lines) this.list_kits_or_assemblies = this.kit_assembly_lines.split(",");

	this.list_abh_items = [];
	this.abh_lines = ns_OrderObject.getFieldValue('custbody_abh_lines');
	if (this.abh_lines) this.list_abh_items = this.abh_lines.split(",");

	this.has_manual_bo = ns_OrderObject.getFieldValue('custbody_manual_backorder') == 'T' ? true : false;
	this.has_backorder = ns_OrderObject.getFieldValue('custbody_is_backorder') == 'T' ? true : false;
	this.has_possible_dropship = ns_OrderObject.getFieldValue('custbody_possible_dropship') == 'T' ? true : false;
	this.has_dropship = ns_OrderObject.getFieldValue('custbody_has_dropship') == 'T' ? true : false;
	this.has_specialorder = ns_OrderObject.getFieldValue('custbody_has_specialorder') == 'T' ? true : false;
	this.has_kits_or_assemblies = ns_OrderObject.getFieldValue('custbody_has_kits_or_assemblies') == 'T' ? true : false;
	this.has_abh_items = ns_OrderObject.getFieldValue('custbody_has_abh') == 'T' ? true : false;

	this.line_item_count = ns_OrderObject.getLineItemCount('item');

	/* Order methods */
	this.getPriceLevel = getPriceLevel;
	this.isOnHold = isOnHold;
	this.isOnManualHold = isOnManualHold;
	this.hasHoldNotes = hasHoldNotes;
	this.isDiscountRequest = isDiscountRequest;
	this.isOverThreshold = isOverThreshold;
	this.isZeroDollar = isZeroDollar;
	this.didCVVFail   = didCVVFail;
	this.hasRejectedCard = hasRejectedCard;
	this.isPayByCheck = isPayByCheck;
	this.isShipToPOBox = isShipToPOBox;
	this.hasComments = hasComments;
	this.isTradePricing = isTradePricing;
	this.hasPromoCode = hasPromoCode;
	this.isFraudCustomer = isFraudCustomer;
	this.isEscalatedCustomer = isEscalatedCustomer;
	this.isWebOrder = isWebOrder;
	this.hasGroundShipping = hasGroundShipping;
	this.isInternational = isInternational;
	this.hasAgreedtoVATTerms = hasAgreedtoVATTerms;
	this.hasCustomWork = hasCustomWork;
	this.hasSIItem = hasSIItem;
	this.hasSalesNotes = hasSalesNotes;
	this.FOBPoint = doFOBPoint;
	this.isWasBackOrder = hasBackorder;
	this.BackOrderLines = doBackOrderLines;
	this.hasPossibleDropShip = hasPossibleDropShip;
	this.hasDropShip = hasDropShip;
	this.DropShipLines = doDropShipLines;
	this.hasSpecialOrder = hasSpecialOrder;
	this.SpecialOrderLines = doSpecialOrderLines;
	this.hasKitsOrAssemblies = hasKitsOrAssemblies;
	this.KitAssemblyLines = doKitAssemblyLines;
	this.hasABH = hasABH;
	this.ABHLines = doABHLines;
	this.hasAger = hasAger;
	this.hasOverSoldSaleItem = hasOverSoldSaleItem;
	this.hasAntique = hasAntique;
	this.hasIntrastateDropShip = hasIntrastateDropShip;
	this.isAmazon = isAmazon;
	this.isPayPal = isPayPal;
	this.hasManualBackOrder = hasManualBackOrder;
	this.isOnPaymentHold = isOnPaymentHold;

	this.hasOverride = hasOverride;
	this.hasSentEmail = hasSentEmail;

	this.isAutoApproved = doAutoApproval;
	this.orderObject = orderObject;
	this.orderId = orderId;

	this.loadComplexData = loadComplexData;
}



/*
	#preProcessOrder(type)

	preProcessOrder() will examine the order for “exceptions”, conditions that require attention before 
	the order can be processed.  Exceptions can take two forms – errors that are required to be manually 
	addressed before the order can be approved (the order is said to be placed “On Hold”) or 
	stocking/inventory issues that require attention that may be automated.

	A full documentation of the new flow is found within Sales Order Processing.docx.  

	preProcessOrder() will automatically place orders On Hold as appropriate, flag orders with inventory 
	exceptions, set the FOB Point appropriately and if the order has no exceptions, or only a back order
	inventory exception, approve the order.

	The function assumes it is being run beforeSubmit and will only operate in create, copy, edit or 
	approve operations.

	__Parameters__  
	+ _type_ {string} [required] - The context in which the record has been submitted.  Automatically
	passed to the function by NetSuite.    

	__Returns__  
	+ _true_, allowing the order to be saved.  

*/

function preProcessOrder(type) {
	var stopwatch = new Stop_Watch('preProcessOrder');
	if (DEBUG) stopwatch.start();

	if (type != 'create' && type != 'copy' && type != 'edit') {
		if (DEBUG) stopwatch.end();
		return true;
	}

	var order = new SalesOrder(nlapiGetNewRecord());
	order.loadComplexData();

	/* 
		On Hold Exceptions
		These reflect issues that will always prevent an order from being approved if present
	*/
	if (order.hasAger() && !order.hasGroundShipping())
		OnHold_Reasons.push(HR_AGER_AND_NON_GROUND);

	if (order.isInternational() && order.hasGroundShipping())
		OnHold_Reasons.push(HR_INTL_AND_GROUND);

	if (order.hasOverSoldSaleItem())
		OnHold_Reasons.push(HR_OVERSOLD_SALE_ITEM);

	if (!order.paymentmethod && order.isWebOrder())
		OnHold_Reasons.push(HR_NO_PAYMENT_AND_WEB);

	if (order.hasIntrastateDropShip())
		OnHold_Reasons.push(HR_INTRASTATE_DROP_SHIP);


	/*
		Needs Attention Exceptions
		These represent issues that need manual attention and the order to be flagged as attention
		given before they can be processed.
	*/

	/*  Manual Holds */
	if ((order.isOnManualHold() || order.hasHoldNotes()) && !order.hasOverride(HR_ON_MANUAL_HOLD))
		OnHold_Reasons.push(HR_ON_MANUAL_HOLD);

	if (order.isDiscountRequest() && !order.hasOverride(HR_DISCOUNT_REQUEST))
		OnHold_Reasons.push(HR_DISCOUNT_REQUEST);


	/* Automatic Holds */
	if (order.isTradePricing() && order.hasPromoCode() && !order.hasOverride(HR_TRADE_AND_PROMO))
		OnHold_Reasons.push(HR_TRADE_AND_PROMO);

	if (order.isOverThreshold(TOTALTHRESHOLD) && !order.hasOverride(HR_OVER_THRESHOLD))
		OnHold_Reasons.push(HR_OVER_THRESHOLD);

	if (order.isInternational() && !order.isZeroDollar() && !order.hasAgreedtoVATTerms() && !order.hasOverride(HR_VAT_APPROVAL))
		OnHold_Reasons.push(HR_VAT_APPROVAL);

	/* Added CVV Check to After Submit 12/10 - CVV information isn't generated before submit for web orders */
	/* if (order.didCVVFail() && order.customform !== CF_WWWORIGIN_PAID && !order.isAmazon() && !order.isPayPal() && !order.hasOverride(HR_CVV_CHECK_FAILED))
		OnHold_Reasons.push(HR_CVV_CHECK_FAILED); */

	if (order.hasComments() && !order.hasOverride(HR_CUSTOMER_COMMENTS))
		OnHold_Reasons.push(HR_CUSTOMER_COMMENTS);

	if (order.isShipToPOBox() && order.isOverThreshold(POBOXTHRESHOLD) && !order.hasOverride(HR_PO_BOX))
		OnHold_Reasons.push(HR_PO_BOX);

	if (order.isPayByCheck() && !order.hasOverride(HR_PAY_BY_CHECK))
		OnHold_Reasons.push(HR_PAY_BY_CHECK);

	if (order.isFraudCustomer() && !order.hasOverride(HR_FRAUD_CUSTOMER))
		OnHold_Reasons.push(HR_FRAUD_CUSTOMER);

	if (order.isEscalatedCustomer() && !order.hasOverride(HR_ESCALATED_CUSTOMER))
		OnHold_Reasons.push(HR_ESCALATED_CUSTOMER);

	if ((order.hasCustomWork() || order.hasSIItem()) && !order.hasOverride(HR_CUSTOM_WORK))
		OnHold_Reasons.push(HR_CUSTOM_WORK);

	if (order.hasSalesNotes() && !order.hasOverride(HR_SALES_NOTES))
		OnHold_Reasons.push(HR_SALES_NOTES);

	if (order.hasAntique() && !order.hasOverride(HR_ANTIQUE_ITEM))
		OnHold_Reasons.push(HR_ANTIQUE_ITEM);


	if (OnHold_Reasons.length > 0) {
		nlapiSetFieldValue('custbody_on_hold','T');
		nlapiSetFieldValues('custbody_onholdreason',OnHold_Reasons);
	} else {
		nlapiSetFieldValue('custbody_on_hold','F');
		nlapiSetFieldValues('custbody_onholdreason',OnHold_Reasons);
	}

	var isWasBackOrder = order.isWasBackOrder() ? 'T' : 'F';
	nlapiSetFieldValue('custbody_is_backorder',isWasBackOrder);
	nlapiSetFieldValue('custbody_backorder_lines',order.BackOrderLines());

	var hasPossibleDropShip = order.hasPossibleDropShip() ? 'T' : 'F';
	nlapiSetFieldValue('custbody_possible_dropship',hasPossibleDropShip);

	var hasDropShip = order.hasDropShip() ? 'T' : 'F';
	nlapiSetFieldValue('custbody_has_dropship',hasDropShip);
	nlapiSetFieldValue('custbody_dropship_lines',order.DropShipLines());

	var hasSpecialOrder = order.hasSpecialOrder() ? 'T' : 'F';
	nlapiSetFieldValue('custbody_has_specialorder',hasSpecialOrder);
	nlapiSetFieldValue('custbody_specialorder_lines',order.SpecialOrderLines());

	var hasKitsOrAssemblies = order.hasKitsOrAssemblies() ? 'T' : 'F';
	nlapiSetFieldValue('custbody_has_kits_or_assemblies',hasKitsOrAssemblies);
	nlapiSetFieldValue('custbody_kit_assembly_lines',order.KitAssemblyLines());

	var hasABH = order.hasABH() ? 'T' : 'F';
	nlapiSetFieldValue('custbody_has_abh',hasABH);
	nlapiSetFieldValue('custbody_abh_lines',order.ABHLines());
	nlapiSetFieldValue('custbody_fob_point',order.FOBPoint());
	nlapiSetFieldValue('custbody_stockedtotal',order.stockedtotal);

	if (OnHold_Reasons.length === 0 && order.isAutoApproved()) {
		nlapiSetFieldValue('custbody_auto_approve', 'T');
		nlapiSetFieldValue('orderstatus', PENDING_FULFILLMENT);
	} else if (OnHold_Reasons.length !== 0 && order.orderstatus === PENDING_FULFILLMENT && !order.hasDropShip() && !order.hasSpecialOrder()) {
		nlapiSetFieldValue('custbody_auto_approve', 'F');
		nlapiSetFieldValue('orderstatus', PENDING_APPROVAL);
	}

	if (DEBUG) stopwatch.end();
	return true;
}



/*
	#postProcessOrder(type)

	postProcessOrder() is the counter-part to preProcessOrder().  Where preProcessOrder() was concerned
	with identifying order exceptions, postProcessOrder() is concerned with dealing with those exceptions.

	The function will look at back order items identified during preProcessOrder().

	__Parameters__  
	+ _type_ {string} [required] - The context in which the record has been submitted.  Automatically
	passed to the function by NetSuite.    

	__Returns__  
	+ _true_, allowing the order to be saved.  

*/

function postProcessOrder(type) {
	var stopwatch = new Stop_Watch('postProcessOrder');
	if (DEBUG) stopwatch.start();
	if (type != 'create' && type != 'copy' && type != 'edit' && type != 'approve') {
		if (DEBUG) stopwatch.end();
		return true;
	}

	var SO_Fields = [];
	var SO_Values = [];

	var order = new SalesOrder(nlapiLoadRecord(nlapiGetRecordType(),nlapiGetRecordId()));

	/* Added CVV Check to After Submit 12/10 - CVV information isn't generated before submit for web orders */
	var OnHold_Reasons = [];
	if (order.ohreasons.length > 0) OnHold_Reasons = OnHold_Reasons.concat(order.ohreasons);	
	if (order.isOnPaymentHold() && order.customform !== CF_WWWORIGIN_PAID && !order.isAmazon() && !order.isPayPal() && !order.hasOverride(HR_CREDIT_CARD))
		OnHold_Reasons.push(HR_CREDIT_CARD);
	if (order.didCVVFail() && order.customform !== CF_WWWORIGIN_PAID && !order.isAmazon() && !order.isPayPal() && !order.hasOverride(HR_CREDIT_CARD)) 
		OnHold_Reasons.push(HR_CREDIT_CARD);
	if (order.hasRejectedCard() && order.customform !== CF_WWWORIGIN_PAID && !order.isAmazon() && !order.isPayPal() && !order.hasOverride(HR_FRAUD_CUSTOMER))
		OnHold_Reasons.push(HR_FRAUD_CUSTOMER)

	if (OnHold_Reasons.length > 0) {
		SO_Fields.push('custbody_on_hold');
		SO_Values.push('T');
		SO_Fields.push('custbody_onholdreason');
		SO_Values.push(OnHold_Reasons);
		if (order.orderstatus === PENDING_FULFILLMENT && !order.hasDropShip() && !order.hasSpecialOrder()) {
			SO_Fields.push('custbody_auto_approve');
			SO_Values.push('F');
			SO_Fields.push('orderstatus');
			SO_Values.push(PENDING_APPROVAL);
		}
	}


	var BackOrder_List;
	var ETA_Comments = [];
	BackOrder_List = order.list_backorder;

	var runningETADate = '';
	var etadate = '';

	if (!order.hasManualBackOrder()) {
		for (var b=0;b<BackOrder_List.length;b++) {
			var linenumber  = BackOrder_List[b];
			var itemnum 	= nlapiGetLineItemValue('item','item',linenumber);
			var itemdesc	= nlapiGetLineItemValue('item','description',linenumber);
			var quantity	= Number(nlapiGetLineItemValue('item','quantity',linenumber));
			var qtycommited = Number(nlapiGetLineItemValue('item','quantitycommitted',linenumber));
			var qtyavail 	= Number(nlapiLookupField('item',itemnum,'quantityavailable'));

			var qtybackordered = (quantity - (qtycommited+qtyavail));
			logMessage += 'We have '+qtybackordered+' '+itemdesc+' backordered.\n<br>';

			if (qtybackordered > 0) var itemeta = calculateItemETA(itemnum,qtybackordered,order.orderstatus);
			if (itemeta) {
				if (!runningETADate) runningETADate = itemeta;
				if (itemeta > runningETADate) runningETADate = itemeta;
				ETA_Comments.push(itemdesc);
			}
		}


		var etacomments = '';
		if (ETA_Comments.length > 0) etacomments = ETA_Comments.join(" & ");
		SO_Fields.push('custbody_eta_comment');
		SO_Values.push(etacomments);

		if (runningETADate) {
			while (runningETADate.getDay() == 0 || runningETADate.getDay() == 6) {
				if (DEBUG && runningETADate) logMessage += 'Pending eta date of '+ nlapiDateToString(runningETADate) +' is on a weekend.\n<br>';
				runningETADate = nlapiAddDays(runningETADate, 1);
			}

			if (runningETADate > TODAY) {
				etadate = nlapiDateToString(runningETADate);
			}
			var etaintwodays = nlapiStringToDate(nlapiDateToString(runningETADate)) < nlapiAddDays(TODAY, 3) ||  
			(TODAY.getDay() == 4 && (nlapiStringToDate(nlapiDateToString(runningETADate)) < nlapiAddDays(TODAY, 5))) || 
			(TODAY.getDay() == 5 && (nlapiStringToDate(nlapiDateToString(runningETADate)) < nlapiAddDays(TODAY, 5))) || 
			(TODAY.getDay() == 6 && (nlapiStringToDate(nlapiDateToString(runningETADate)) < nlapiAddDays(TODAY, 4)));
			var etainfuture  = nlapiStringToDate(nlapiDateToString(runningETADate)) > nlapiAddDays(TODAY, ETAFUTURELIMIT);
		}

		SO_Fields.push('custbody_eta_date');
		SO_Values.push(etadate);
	}

	if (DEBUG) nlapiLogExecution('AUDIT', logSubject, logMessage);
	if (SO_Fields.length > 0) nlapiSubmitField(nlapiGetRecordType(),nlapiGetRecordId(), SO_Fields, SO_Values);

	/* Auto-Email Section */
	var emailtemplate = '';
	var emailresult = '';

	if (!order.hasSentEmail() && order.orderstatus == PENDING_FULFILLMENT) {

		if (order.hasDropShip()) emailtemplate = ET_DROPSHIP_TEMPLATE;
		else if (order.isOverThreshold(SPLITTHRESHOLD) && order.stockedtotal > STOCKTHRESHOLD) emailtemplate = ET_SPLIT_TEMPLATE;
		else if (BackOrder_List.length > 1) emailtemplate = ET_MULTIPLE_TEMPLATE;
		else emailtemplate = ET_SINGLE_TEMPLATE;

		if (order.isInternational() && BackOrder_List.length > 1) emailtemplate = ET_MULTIPLE_TEMPLATE;
		else if (order.isInternational()) emailtemplate = ET_SINGLE_TEMPLATE;

		/* Not going to email because there are no back orders */
		if (BackOrder_List.length == 0) {
			if (order.hasDropShip()) emailresult = ER_ALL_DROPSHIP;
			else if(order.hasKitsOrAssemblies()) emailresult = ER_KIT_ON_ORDER;
			else emailresult = ER_NOT_ON_BACKORDER;
		} 

		/* Other no-email exceptions */
		else if (!order.email) emailresult = ER_NO_EMAIL_ADDRESS;
		else if (order.email.indexOf("marketplace.amazon.com") !== -1) emailresult = ER_AMAZON_EMAIL;

		/* Date-base exceptions */
		else if (!runningETADate) emailresult = ER_NO_ETA_DATE;
		else if (runningETADate <= TODAY) emailresult = ER_ETA_TODAY_OR_PAST;
		else if (etaintwodays) emailresult = ER_ETA_IN_TWO_DAYS;
		else if (etainfuture) emailresult = ER_ETA_IN_FUTURE;

		/* Order-based exceptions */
		else if (order.isOverThreshold(EMAILTHRESHOLD)) emailresult = ER_ORDER_OVER_LIMIT;
		else if (order.isZeroDollar()) emailresult = ER_ZERO_DOLLAR_LIMIT;

		/* Auto-email success results */
		else if (emailtemplate == ET_SPLIT_TEMPLATE) emailresult = ER_EMAIL_SENT_SPLIT;
		else emailresult = ER_EMAIL_SENT;
	}

	if (emailresult === ER_EMAIL_SENT || emailresult === ER_EMAIL_SENT_SPLIT) {
		if (!doBackOrderEmail(order.customer,emailtemplate,nlapiGetRecordId(),etadate,etacomments)) emailresult = ER_NO_EMAIL_ADDRESS;
	}

	if (emailresult !== '') {
		nlapiSubmitField(nlapiGetRecordType(),nlapiGetRecordId(), 'custbody_email_result', emailresult);
	}

	if (DEBUG) stopwatch.end();
	return true;
}







/*
	#calculateItemETA(itemnum, itemqty)

	Calculates the ETA to fulfill the given quantity for a given inventory item.  Looks at the item record
	for a 'Vendor ETA' date and adds the vendor's lead time to that.  If that does not result in a valid 
	future date, then the function will examine any open Purchase Orders with the item.	If none exist, then 
	the function will try to predict when the next PO for that item will be placed and when it will be 
	likely to arrive.

	__Parameters__  
	+ _itemnum_ {int} [required] - The internal ID of a NetSuite item record to be checked.  
	+ _itemqty_ {int} [required] - The quantity on back order needed to be fulfilled.  
	+ _orderstatus_ {string} - The status of the order.  Important to know if the item has already been comitted.  

	__Returns__
	+ A Date object with the ETA of the item, or _null_, if it cannot find a valid ETA or qty is 0.
*/
function calculateItemETA(itemnum, itemqty, orderstatus) {

	var itemeta = null;
	if (itemqty === 0) return null;

	if (orderstatus == null) orderstatus = PENDING_APPROVAL;

	/*
		There are a few things we're going to check here.  If one fails, we'll move on the next.  
		+ Vendor ETA & Lead Time
		+ Open Purchase Orders
		+ Minimum time between orders for when the next PO will be placed.
	*/

	var itemfields 		= nlapiLookupField('item', itemnum, ['vendor', 'custitem_vendoreta']);
	var vendorfields 	= nlapiLookupField('vendor', itemfields.vendor, ['custentity_vendor_lead_time','custentity_vendor_time_between_orders']);
	var vendoreta 		= itemfields.custitem_vendoreta;
	var leadtime 		= Number(vendorfields.custentity_vendor_lead_time);
	var orderinterval 	= Number(vendorfields.custentity_vendor_time_between_orders);


	/* Open POs */
	/* 
		10/14/2014 - Mike & Josh have changed the order of ETA calculation to increase accuracy by doing the
		open PO calculation first 
	*/
	itemeta = getOpenPOETA(itemnum,itemqty,leadtime, orderstatus);
	if (itemeta) return itemeta;

	/* 	Vendor ETA + Lead Time */
	itemeta = getVendorETA(vendoreta,leadtime);
	if (itemeta) return itemeta;

	/* Next PO to be ordered */
	itemeta = getNextPOETA(itemfields.vendor,leadtime,orderinterval);
	if (itemeta) return itemeta;

	return null;
}


/*
	getVendorETA(vendoreta,leadtime)

	Tests the vendor ETA date & lead time values passed to it, and compares the addition of
	the two to today's date.  If both values exist, and the resulting addition is a later date
	than today, the function returns the new Date, otherwise, it returns null.

	__Parameters__  
	+ _vendoreta_ {string} [required] - A string containing the Vendor ETA date of the item.  
	+ _leadtime_ {int} [required] - A number containing the number of days of lead time populated for that vendor.  

	__Returns__
	+ A Date object with the ETA of the item, or _null_, if it cannot find a valid ETA
*/	
function getVendorETA(vendoreta,leadtime) {
	try{
		if (vendoreta) vendoreta = nlapiStringToDate(vendoreta);
		if (leadtime && vendoreta) var eta = nlapiAddDays(vendoreta, leadtime);
		logMessage += 'Attemping to calculate eta from vendor eta '+ nlapiDateToString(vendoreta) +' and '+ leadtime +' days lead time for ETA date of '+ nlapiDateToString(eta) +'.\n<br>';

		return (eta && eta >= TODAY) ? eta : null;
	} catch(e) {
		logMessage += 'Attempt to calculate eta from vendor eta failed.\n<br>';
		return null;
	}
}


/*
	getOpenPOETA(itemnum, itemqty, leadtime, orderstatus)

	Checks if there is an open PO that will fufill the passed in item and quantity.  If a
	vendor lead time is present and no open PO has a due date, getOpenPOETA() will return
	the PO's date plus the lead time.

	__Parameters__  
	+ _itemnum_ {int} [required] - The internal ID of a NetSuite item record to be checked.  
	+ _itemqty_ {int} [required] - The quantity on back order needed to be fulfilled.  
	+ _leadtime_ {int} - A number containing the number of days of lead time populated for that vendor.  
	+ _orderstatus_ {string} - The status of the order.  Important to know if the item has already been comitted.  

	__Returns__
	+ A Date object with the ETA of the item, or _null_, if it cannot find a valid ETA
*/	
function getOpenPOETA(itemnum, itemqty, leadtime, orderstatus) {

	var eta = null;
	var hoah_eta = null;

	var filters = [];
	filters.push(new nlobjSearchFilter('item', null, 'anyof', itemnum));
	filters.push(new nlobjSearchFilter('mainline', null, 'is', 'F'));
	filters.push(new nlobjSearchFilter('formulanumeric', null, 'greaterthan', 0).setFormula('{quantity} - {quantityshiprecv}'));
	filters.push(new nlobjSearchFilter('status', null, 'noneof', "PurchOrd:H")); // Not Closed

	var columns = [];
	columns.push(new nlobjSearchColumn('entity'));
	columns.push(new nlobjSearchColumn('duedate'));
	columns.push(new nlobjSearchColumn('quantity'));
	columns.push(new nlobjSearchColumn('quantityshiprecv'));
	columns.push(new nlobjSearchColumn('trandate'));
	columns.push(new nlobjSearchColumn('custcol_vendoreta'));

	var results = nlapiSearchRecord('transaction', 'customsearch_purchase_orders_backorder', filters, columns);

	if (results) {
		logMessage += 'Found open POs.\n<br>';

		/* We need to normalize stock units */
		var stockrate	= 1;
		var purchrate	= 1;
		var salesrate	= 1;

		var itemfields 	= nlapiLookupField('item', itemnum, ['stockunit', 'purchaseunit', 'saleunit', 'unitstype','custitem_vendor_eta','quantitybackordered']);
		if (itemfields.custitem_vendor_eta) hoah_eta = nlapiStringToDate(itemfields.custitem_vendor_eta);

		if (!areEqual(itemfields.stockunit,itemfields.purchaseunit,itemfields.saleunit)) {
			var unitType 	= nlapiLoadRecord('unitstype',itemfields.unitstype);
			for (var x=1;x<=unitType.getLineItemCount('uom');x++) {
				if (unitType.getLineItemValue('uom','internalid',x) === itemfields.stockunit) stockrate = unitType.getLineItemValue('uom','conversionrate',x);
				if (unitType.getLineItemValue('uom','internalid',x) === itemfields.purchaseunit) purchrate = unitType.getLineItemValue('uom','conversionrate',x);
				if (unitType.getLineItemValue('uom','internalid',x) === itemfields.saleunit) salesrate = unitType.getLineItemValue('uom','conversionrate',x);
			}
		} 

		if (!itemfields.quantitybackordered) itemfields.quantitybackordered = 0;
		if (orderstatus === PENDING_APPROVAL) var qtybackorder = Number(itemqty) + Number(itemfields.quantitybackordered);
		else var qtybackorder = Number(itemfields.quantitybackordered);
		qtybackorder 	 = qtybackorder*Number(salesrate);
		logMessage += 'Looking for POs with enough to cover '+ qtybackorder +' units.\n<br>';
				
		for (var j = 0; qtybackorder > 0 && j < results.length; j++) {
			var podate 		= results[j].getValue('trandate');
			var poduedate 	= results[j].getValue('duedate');
			var vendoreta	= results[j].getValue('custcol_vendoreta');
			var poquantity 	= Number(results[j].getValue('quantity'));
			var recquantity = Number(results[j].getValue('quantityshiprecv'));

			logMessage += 'Looking at PO created on '+ podate +'.\n<br>';

			poquantity = poquantity-recquantity;
			poquantity = poquantity*Number(purchrate);

			if (poquantity >= qtybackorder) { 
				qtybackorder = 0;
				if (vendoreta) {
					eta = nlapiStringToDate(vendoreta);
					eta = nlapiAddDays(eta, leadtime);
					logMessage += 'Found a PO with a vendor ETA on '+ nlapiDateToString(eta) +'.\n<br>';
				} else if (poduedate) {
					eta = nlapiStringToDate(poduedate);
					logMessage += 'Found a PO due on '+ nlapiDateToString(eta) +'.\n<br>';
				} else if (leadtime) {
					eta = nlapiStringToDate(podate);
					eta = nlapiAddDays(eta, leadtime);
					logMessage += 'Found a PO but there was no due date, using '+ leadtime +' days lead time for ETA date of '+ nlapiDateToString(eta) +'.\n<br>';
				}
			} else {
				qtybackorder -= poquantity;
			}
		}
	} 

	/*
		Update in .94, Purchasing has previously updated HOAH ETA if an order pushed restocking date to the next PO.
	*/
	if (eta && eta > hoah_eta) {
		nlapiSubmitField('inventoryitem',itemnum,'custitem_vendor_eta',nlapiDateToString(eta));
	}

	return eta;
}



/*
	getNextPOETA(vendorid,leadtime,interval)

	Checks when the last PO was created for a given vendor, and then using the lead time & interval
	passed to the function

	__Parameters__  
	+ _vendorid_ {int} [required] - The internal ID of a NetSuite vendor record to be checked.
	+ _leadtime_ {int} [required] - A number containing the number of days of lead time populated for that vendor.
	+ _interval_ {int} [optional] - The number of days between orders sent to the vendor.

	__Returns__
	+ A Date object with the ETA of the item, or _null_, if it cannot find a valid ETA
*/
function getNextPOETA(vendorid,leadtime,interval){
	var eta = null;

	if (leadtime && interval) {
		var filters = [];
		filters.push(new nlobjSearchFilter('mainline', null, 'is', 'F'));
		filters.push(new nlobjSearchFilter('entity', null, 'anyof', vendorid));
		filters.push(new nlobjSearchFilter('trandate', null, 'onorafter', 'daysago' + interval));

		var columns = [];
		columns.push(new nlobjSearchColumn('trandate'));

		var results = nlapiSearchRecord('purchaseorder', null, filters, columns);

		if (results) {
			previousorder 	= results[results.length - 1].getValue('trandate');
			eta 			= nlapiAddDays(TODAY, leadtime);
			lastorderdays 	= (TODAY - nlapiStringToDate(previousorder)) / MS_PER_DAY;
			eta 			= nlapiAddDays(eta, (interval - lastorderdays));
			logMessage += 'Using the ETA date '+ nlapiDateToString(eta) +' which is '+ (interval - lastorderdays) +' days from today, plus '+ leadtime +' lead time.\n<br>';
		} else { // No recent orders
			eta = nlapiAddDays(TODAY, leadtime);
			logMessage += 'There were no recent orders, using '+ leadtime +' days lead time for ETA date of '+ nlapiDateToString(eta) +'.\n<br>';
		}
	} else if (leadtime) { // no minimum between orders
		eta = nlapiAddDays(TODAY, leadtime);
		logMessage += 'There was no minimum time, using '+ leadtime +' days lead time for ETA date of '+ nlapiDateToString(eta) +'.\n<br>';
	}

	return eta;
}



/*
	#doBackOrderEmail(customer,template,recordid,eta,comments)

	Sends an email to the specified template merging with the specified sales order.

	__Parameters__  
	+ _customer_ {int} [required] - the internal id of the customer to be emailed
	+ _template_ {int} [required] - the internal id of the template that will be used to email the customer
	+ _recordid_ {int} [required] - the internal id of the sales order that will be used in the merge operation
	+ _eta_ {string} [required] - a formatted date string that represents the date the order is due
	+ _comments_ {string} [required] - created string data with the items on back order

	__Returns__  
	+ _true_ if the email was sent.  If there is no customer record for the id passed through, or if there is
	no email address on the customer record, doBackOrderEmail returns _false_.
*/
function doBackOrderEmail(customer,template,recordid,eta,comments) {

	try {
        var cust_email = nlapiLookupField('customer',customer,'email');
		var emailtemp  = nlapiLoadRecord('emailtemplate',template);
		var body       = emailtemp.getFieldValue('content');
		var subject    = emailtemp.getFieldValue('subject');

		var so_record  = nlapiLoadRecord('salesorder',recordid);

		var renderer = nlapiCreateTemplateRenderer();
		renderer.addRecord('transaction',so_record);
		renderer.setTemplate(subject);
		var emailSubject = renderer.renderToString();
		renderer.setTemplate(body);
		var emailBodyText = renderer.renderToString();

		var records				= new Object();
		records['transaction'] 	= recordid;

		var emailFrom 			= '2753807'; //Orders@ HOAH.com email address
		var JOSHUABRUCE			= '1852071'; //employee internal id for debugging
		if (CONTEXT.environment !== 'PRODUCTION') emailFrom = JOSHUABRUCE;

		if (cust_email) {
			nlapiSendEmail(emailFrom,customer,emailSubject,emailBodyText,null,null,records,null,true,false);
			return true;
		} else {
			logMessage += 'Customer doesn\'t have an email address.\n<br>';
			return false;
		}
	} catch(e) {
		logMessage += 'Error caught trying to email: '+e.message+'.\n<br>';
		return false;
	}
}



/*
	#onSalesOrderLoad(type)

	onSalesOrderLoad() is called in a beforeLoad context and may draw several new buttons on the sales
	order - each will override a specific reason why an order is on hold.  It will also hide the
	approval button if the order is on hold.

	__Parameters__  
	+ _type_ {string} [required] - The context in which the record has been submitted.  Automatically
	passed to the function by NetSuite. 
	+ _form_ {string} [required] - The current form being viewed. Automatically passed to the function
	by NetSUite. 

	__Returns__  
	+ _true_, allowing the order to be saved.  

*/

function showOverrideButtons(type,form) {
	var stopwatch = new Stop_Watch('showOverrideButtons');
	if (DEBUG) stopwatch.start();

	if (type != 'view') {
		if (DEBUG) stopwatch.end();
		return true;
	}

	if (!ROLE_CANEDITSO) {
		if (DEBUG) stopwatch.end();
		return true;
	}

	var orderstatus = nlapiGetFieldValue('orderstatus');
	if (PENDING_STATUSES.indexOf(orderstatus) == -1) {
		if (DEBUG) stopwatch.end();
		return true;
	}

	/* Version 1.1 - orders can no longer be closed */
	form.removeButton('closeremaining');
	//nlapiSetFieldValue("custbody_custom_html", getHideButtonsScript(onhold), false);

	var onhold = nlapiGetFieldValue('custbody_on_hold');
	var hold_overrides = nlapiGetFieldValues('custbody_override_hold_reasons');
	if (!hold_overrides) hold_overrides = [];
	var manual_override = hold_overrides.indexOf(HR_ON_MANUAL_HOLD);

	if (onhold != 'T' && manual_override == -1)  {
		if (DEBUG) stopwatch.end();
		return true;
	}
	
	var hold_reasons = nlapiGetFieldValues('custbody_onholdreason');
	if (!hold_reasons) hold_reasons = [];
	var hold_reasons_texts = nlapiGetFieldTexts('custbody_onholdreason');

	if (onhold == 'T') {
		var savescript = 'var record = nlapiLoadRecord(nlapiGetRecordType(),nlapiGetRecordId());if (record && nlapiGetRecordType() == \'salesorder\') {record.setFieldValues(\'custbody_override_hold_reasons\',overrides); nlapiSubmitRecord(record); document.location.reload();}';
		var arrayscript = 'var overrides = ['+hold_overrides.join()+'];';
		for (var z=0; z<hold_reasons.length; z++) {
			if (hold_overrides.indexOf(hold_reasons[z]) == -1 && MANDATORY_HOLDS.indexOf(hold_reasons[z]) == -1 && (IS_MANAGER || MANAGER_HOLDS.indexOf(hold_reasons[z]) == -1)) {
				var override_script = arrayscript+'overrides.push('+hold_reasons[z]+');'+ savescript;
				form.addButton('custpage_override_button'+z,'Override '+hold_reasons_texts[z],override_script);
			}
		}

		/* Version 1.1 - orders on hold can no longer be fulfilled */
		form.removeButton('approve');
		form.removeButton('process');
	}

	if (manual_override > -1) {
		if (hold_overrides.length === 1) {
			hold_overrides = [];
		} else {
			hold_overrides.splice(manual_override,1);
		}
		manual_hr = [HR_ON_MANUAL_HOLD];
		manual_plus_hr = hold_reasons.concat(manual_hr);
		var arrayscript = 'var overrides = ['+hold_overrides.join()+']; var holdreasons = ['+manual_plus_hr.join()+'];';
		var savescript = 'var record = nlapiLoadRecord(nlapiGetRecordType(),nlapiGetRecordId());if (record && nlapiGetRecordType() == \'salesorder\') {record.setFieldValues(\'custbody_override_hold_reasons\',overrides); record.setFieldValues(\'custbody_onholdreason\',holdreasons); nlapiSubmitRecord(record); document.location.reload();}';
		var manual_hold_script = arrayscript + savescript;
		form.addButton('custpage_manual_hold','Place Back On Manual Hold',manual_hold_script);
	}

	if (DEBUG) stopwatch.end();
	return true;
}







/* 	============================================================== HELPER FUNCTIONS 
	Small functions that encapsulate business rules for reusability.
=================================================================================== */


/*
	#isABH(itemName)

	Checks to see if the item is an ABH item by searching for '-ABH' in the item name.

	__Parameters__  
	+ _itemName_ {string} [required] - The item name to be checked. 

	__Returns__  
	+ _true_ or _false_ if is an ABH item or not.  
*/
function isABH(itemName) {
	return itemName.search('-ABH') > 0 ? true : false;
}

/*
	#isAger(itemName)

	Checks to see if the item is ager by searching for '-AGER' in the item name.
	Version 1.6.02 adds a check if the item name is R-08KN-M-3Q which doesn't follow the
	same naming convention.

	__Parameters__  
	+ _itemName_ {string} [required] - The item name to be checked. 

	__Returns__  
	+ _true_ or _false_ if is an ABH item or not.  
*/
function isAger(itemName) {
	if (itemName === 'R-08KN-M-3Q') return true;
	return itemName.search('-AGER') > 0 ? true : false;
}


/*
	#isCustomWork(itemName)

	Checks to see if the item is custom work by searching for 'CW-' in the item name.

	__Parameters__  
	+ _itemName_ {string} [required] - The item name to be checked. 

	__Returns__  
	+ _true_ or _false_ if is an ABH item or not.  
*/
function isCustomWork(itemName) {
	return itemName.search('CW-') >= 0 ? true : false;
}


/*
	#isSIItem(itemName)

	Checks to see if the item is a SI item by searching for 'SI-' in the item name.

	__Parameters__  
	+ _itemName_ {string} [required] - The item name to be checked. 

	__Returns__  
	+ _true_ or _false_ if is an ABH item or not.  
*/
function isSIItem(itemName) {
	return itemName.search('SI-') >= 0 ? true : false;
}

/*
	#isGroundShipping()

	Checks to see if the current order is being shipped Ground.

	__Parameters__  
	+ void

	__Returns__  
	+ _true_ or _false_ if the order is being shipped Ground or not.  
*/
function isGroundShipping(shipmethod) {
	var GROUNDSHIPPING = '29274';
	return shipmethod == GROUNDSHIPPING ? true : false;
}

/*
	#areEqual([arguments])

	Checks any number of arguments passed for equality.

	__Parameters__  
	+ _[arguments]_ {variant} [required] - A series of values to be checked 

	__Returns__  
	+ _true_ if all the arguments passed are equal, _false_ if not.
*/
function areEqual(){
	var len = arguments.length;
	for (var i = 1; i< len; i++){
		if (arguments[i] == null || arguments[i] != arguments[i-1]) return false;
	}
	return true;
}

/*
	#isBasePrice()

	Checks to see if the passed in price level is Base Price.

	__Parameters__  
	+ void

	__Returns__  
	+ _true_ or _false_ if the price level is base price or not.  
*/
function isBasePrice(pricelevel) {
	return pricelevel == PL_BASE ? true : false;
}

/*
	#isTradePrice()

	Checks to see if the passed in price level is one of several Trade Price levels.

	__Parameters__  
	+ _pricelevel_ {string} [required] - A string with an integer representing a price level

	__Returns__  
	+ _true_ or _false_ if the price level is base price or not.  
*/
function isTradePrice(pricelevel) {
	return pricelevel == PL_TRADE || pricelevel == PL_ZTRADE ? true : false;
}



/*
	#fixAddress(address)

	Removes extraneous NetSuite formatting from address strings.

	__Parameters__  
	+ _address_ {string} [required] - An address to be reformatted

	__Returns__  
	+ A string with the changed address information.
*/
function fixAddress(address) {
	while (address.search('  ') >= 0) {
		address = address.replace('  ', ' ');
	}

	while (address.search(' \r') >= 0) {
		address = address.replace(' \r', '\r');
	}

	return address;
}


/*
	#getAvailableQty(itemNum)

	Invokes the Get Item Quantity Suitelet to return available qty for a given item.

	__Parameters__  
	+ _itemNum_ {int} [required] - The internal ID of a NetSuite item record to be checked. 

	__Returns__  
	+ An integer representing available quantity.
*/
function getAvailableQty(itemNum) {

	if (CONTEXT.environment === 'PRODUCTION') {
		var admin 	= '1685738';
		var url 	= 'https://forms.netsuite.com/app/site/hosting/scriptlet.nl?script=94&deploy=1&compid=411534&h=5ae0ac372a3ec0f425c4&custscript_itemquantity_itemid=';
	} else {
		var admin 	= '1290517';
		var url 	= 'https://forms.sandbox.netsuite.com/app/site/hosting/scriptlet.nl?script=33&deploy=1&compid=411534&h=94d92dd779789cefe928&custscript_itemquantity_itemid=';
	}

	var response = nlapiRequestURL(url + itemId);
	return Number(response.body);
}



function getHideButtonsScript(onhold) {
	var script = "";
	script += "<script type=\"text/javascript\">";

	if (onhold === 'T') {
		script += "	function hideApproveButton()";
		script += "	{";
		script += "		var approveButton = document.getElementById(\"tbl_approve\");";
		script += "		if(approveButton)";
		script += "		{";
		script += "			approveButton.parentNode.style.display = \"none\";";
		script += "		}";
		script += "		else";
		script += "		{";
		script += "			window.setTimeout(\"hideApproveButton()\", 50);";
		script += "		}";
		script += "	}";
		script += "";
		script += "	hideApproveButton();";
		script += "	function hideFulfillButton()";
		script += "	{";
		script += "		var fulfillButton = document.getElementById(\"tbl_process\");";
		script += "		if(fulfillButton)";
		script += "		{";
		script += "			fulfillButton.parentNode.style.display = \"none\";";
		script += "		}";
		script += "		else";
		script += "		{";
		script += "			window.setTimeout(\"hideFulfillButton()\", 50);";
		script += "		}";
		script += "	}";
		script += "";
		script += "	hideFulfillButton();";
	}
	script += "	function hideCloseButton()";
	script += "	{";
	script += "		var closeButton = document.getElementById(\"tbl_closeremaining\");";
	script += "		if(closeButton)";
	script += "		{";
	script += "			closeButton.parentNode.style.display = \"none\";";
	script += "		}";
	script += "		else";
	script += "		{";
	script += "			window.setTimeout(\"hideCloseButton()\", 50);";
	script += "		}";
	script += "	}";
	script += "";
	script += "	hideCloseButton();";
	script += "</script>";
	return script;
}