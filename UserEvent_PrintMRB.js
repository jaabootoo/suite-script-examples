/*
NetSuite Print Word Template
-----------------------------------------------------------------------------------
Written by: Joshua Bruce  
A simple SuiteScript that prints out a custom record as a Word document for the
Warehouse team to use. The script runs as a suitelet that takes data from an 'MRB' 
record (a custom record that holds information about a defective item part #) and 
merges the data with a Word template and sends the Word file to the client.


NetSuite Information
-----------------------------------------------------------------------------------
Script Record: 		__Add Print Button to MRB__ & __Print MRB Record__  
Script Record ID: 	__customscript86 & customscript_print_mrb__  
Type: 				__User Event & Suitelet__  

Deployments: 		__Material Review Board: onLoad & GETRequest__  
Deployment ID: 		__customdeploy_printmrb__ & __customdeploy_print_mrb__  

Version History
-----------------------------------------------------------------------------------
+ Version 1.00.0 - Release Version 1
+ Version 0.06.0 - Change to display vendor name instead of item name
+ Version 0.05.1 - Documentation changes
+ Version 0.05.0 - Script creation and intial check in
*/

var MRB_TEMPLATE_RECORD 	= '224';  //The internalid of the word .dot file
var RESPONSE_CONTENT_TYPE	= 'WORD';

function printMRBRecord(request, response)
{
		
	var transactionRecord 	= request.getParameter('transactionRecord');
	var tranType 			= request.getParameter('transactionType');
	var record 				= nlapiLoadRecord(tranType, transactionRecord);	
	
	/* Grab the data we need from the MRB record and place into a keyed array for the merge operation */
	var external_fields 	= new Array();
	external_fields['NLNAME'] 						= record.getFieldValue('name');
	external_fields['NLCREATED'] 					= record.getFieldValue('created');
	external_fields['NLCUSTRECORD_VENDOR_SELECT'] 	= record.getFieldValue('custrecord_vendor_select');
	external_fields['NLCUSTRECORD_PO'] 				= record.getFieldValue('custrecord_po');
	external_fields['NLCUSTRECORD_MRB_VENDORNAME']	= record.getFieldValue('custrecord_mrb_vendorname');
	external_fields['NLCUSTRECORD_MRB_QUANTITY'] 	= record.getFieldValue('custrecord_mrb_quantity');
	external_fields['NLCUSTRECORD_CUSTRECORD2'] 	= record.getFieldValue('custrecord2');  				// This is the detailed description field. Someone previous named this field poorly.
	external_fields['NLCUSTRECORD_ACTION1'] 		= record.getFieldValue('custrecord_action1'); 			// The newly renamed Vendor Action Item field.

	var document = nlapiMergeRecord(MRB_TEMPLATE_RECORD, tranType, transactionRecord, null, null, external_fields);
	response.setContentType(RESPONSE_CONTENT_TYPE);
	response.write(document.getValue());
}

/*
	To invoke the print function, we're going to add a custom button to the form that we use to edit our custom records.
	NetSuite makes this really easy by giving us a hook on custom forms to code like this.
*/
function myButton(type,form)
{
	if ( type != 'view') return;
	var url = nlapiResolveURL('SUITELET','customscript_print_mrb','customdeploy_print_mrb') + '&transactionRecord='+nlapiGetRecordId() + '&transactionType='+nlapiGetRecordType();
	form.addButton('custpage_mybutton','Print MRB to Word', "document.location='"+url+"'");
}
