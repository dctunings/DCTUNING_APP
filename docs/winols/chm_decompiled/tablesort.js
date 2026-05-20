function simplify(str)
{
   return (str.replace(/(Strg\+)/,"").replace(/(Ctrl\+)/,"").replace(/(Shift\+)/,"").replace(/(Alt\+)/,"").replace(/(Win\+)/,""));
}

function sortTable(table_id, sortColumn)
{
   var tableData = document.getElementById(table_id).getElementsByTagName('tbody').item(0);
   var rowData   = tableData.getElementsByTagName('tr');            

   for (var i=1; i<rowData.length-1; i++)
      if (simplify(rowData.item(i).getElementsByTagName('td').item(sortColumn).innerText) > simplify(rowData.item(i+1).getElementsByTagName('td').item(sortColumn).innerText))
      {
         tableData.insertBefore(rowData.item(i+1),rowData.item(i));
         i-=2;
         if (i<0) i=0;
      }
}