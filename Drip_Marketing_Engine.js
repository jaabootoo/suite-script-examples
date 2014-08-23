/* 
Drip Marketing Engine
-----------------------------------------------------------------------------------
Written by: Joshua Bruce  

NetSuite Information
-----------------------------------------------------------------------------------
Script Record:    __Drip Marketing Engine__  
Script Record ID: __customscript_dripmarketing_engine__  
Type:             __User Event__  

Deployments:      __Scheduled w/ Parameters__  
Deployment ID:    
Libraries:        __reportError.js__  

Version History
-----------------------------------------------------------------------------------
+ Version 1.00.00 - Version 1.00.00 released
*/

/*
	A series of functions that allow for multiple "Drip Marketing" campaigns to be scheduled and continuously run. 
	The Drip Engine has multiple deployments - each accepts a customer saved search id and an email template id 
	and invokes the engine which sends the template's contents to each customer within the saved search. 
*/


/* Debugging switches */
var context 		= nlapiGetContext();
var DEBUG 			= false;
var DEBUG_EMAIL 	= 'debug.email@domain.com';
var DEBUG_BCC 		= 'debug.cc@domain.com';
var MAX_SENDS 		= 1;

/* Hard-coded employee numbers for debugging.  Normally these would be pulled from context */
var DEBUG_ACCOUNT	= (context.environment === 'PRODUCTION') ? '1879456' : '1290521';
var MARKETING 		= (context.environment === 'PRODUCTION') ? '2205492' : '1290520';
var TODAY = nlapiDateToString(new Date());


/*
	#doDripMarketingCampaign()

	Loads a saved search and email template based on deployment parameters and emails the contents of
	the template to the customers listed in the results of the saved search.  Assumes that the saved
	search passed as custscript_drip_savedsearch is a customer search with the email address field
	available for reading.

	__Assumptions__
	As of Version 1.0, doDripMarketing() also will assume that the saved search passed to it contains
	less than 1000 records, which is the limit of any result set.  Should we find that any saved search
	will approach or exceed this number, a new version will have to be written to handle these cases.

	__Parameters__  
	+ void

	__Deployement Parameters__  
	+ _custscript_drip_savedsearch_ {string} [required] - the internal id of a customer search which
	doDripMarketing() will run to obtain a list of customers to email.  
	+ _custscript_drip_emailtemplate_ {string} [required] - the internal id of an email template that
	will be emailed to each customer.  

	__Returns__  
	+ void 
*/

function doDripMarketingCampaign() {
	try {
		var search_id	= context.getSetting('SCRIPT', 'custscript_drip_savedsearch');
		var template_id	= context.getSetting('SCRIPT', 'custscript_drip_emailtemplate');
		if (DEBUG) nlapiLogExecution('DEBUG', 'Parameters', 'Search ID: ' + search_id + ', Template ID: ' + template_id);
		var resultSet 	= nlapiSearchRecord('customer',search_id);
	} catch (e) {
		reportError(e, 'Drip_Marketing_Engine.js', 'doDripMarketingCampaign() Loading Search');
	}

	if (!resultSet) return;

	for (var i=0;i<resultSet.length;i++) {
		searchResult 	  = resultSet[i];
		var templateFile  = mergeTemplate(searchResult,search_id,template_id);

		/* Some of our searches might not return clean customer records but rather joined rows.  If there
		is no record ID within the search, then we'll do NetSuite's work for it. */
		if ((searchResult.getId()) {
			var customerNum	= searchResult.getId();
		} else {
			var customerNum	= searchResult.getValue('internalid',null,'group');
		}

		doDripSend(customerNum,templateFile);
		if (DEBUG && i === (MAX_SENDS-1)) {
			break;
		}
	}
}



/*
	#mergeTemplate(resultRow,searchID,templateID)

	Returns a nlobjFile object with a merged template based on the specific rules of each drip campaign. 

	__Parameters__  
	+ _resultRow_ {nlobjSearchResult} [required] - a search result row representing a single customer  
	+ _searchID_ {string} [required] - the internal id of the search that was run  
	+ _templateID_ {string} [required] - the internal id of the template to use for the merge

	__Returns__  
	+ A nlobjFile object containing the merged template 
*/
function mergeTemplate(resultRow,searchID,templateID) {
	try {
		var templateReplacements = new Object();

		/* Again, we need to handle saved searches that might not return row ids */
		if (resultRow.getId()) {
			var relatedCust = resultRow.getId();
		} else {
			var relatedCust = resultRow.getValue('internalid',null,'group');
		}

		var fields 		= ['firstname','companyname'];
		var custFields 	= nlapiLookupField('customer',relatedCust,fields);
		var custName 	= custFields.firstname;
		if (!custFields.firstname) {
			custName 	= custFields.companyname;
		}

		/* Camel-case the customer name, some of our users enter names in all lower case. */
		custName = custName.toLowerCase().replace(/\b[a-z]/g, function(letter) { return letter.toUpperCase(); });
		templateReplacements['NLNAME'] = custName;

		relatedCust	= DEBUG ? DEBUG_ACCOUNT : relatedCust;
		return nlapiMergeRecord(templateID,'customer',relatedCust,null,null,templateReplacements);

	} catch(e) {
		reportError(e, 'Drip_Marketing_Engine.js', 'mergeTemplate()');
	}
}



/*
	#doDripSend(customerID,template)

	Sends a prepared email template to a specified customer and then updates the "Last Drip Date" field to
	the current date.

	__Parameters__  
	+ _customerID_ {string} [required] - the internal id of the customer to which an email will be sent  
	+ _template_ {nlobjFile} [required] - a file containing the body and subject of the email to be sent

	__Returns__  
	+ void 
*/
function doDripSend(customerID,template) {
	try {
		if (DEBUG) customerID = DEBUG_ACCOUNT;
		var records			  = new Object();
		records['entity'] 	  = customerID;

		var email = DEBUG ? DEBUG_EMAIL : nlapiLookupField('customer',customerID,'email');
		var bcc	  = DEBUG ? DEBUG_BCC : null;

		if (email) nlapiSendEmail(MARKETING,email,template.getName(),template.getValue(),null,bcc,records,null);
		nlapiSubmitField('customer',customerID,'custentity_last_drip_date',TODAY);
	} catch (e) {
		reportError(e, 'Drip_Marketing_Engine.js', 'doDripSend()');
	}
	return;
}