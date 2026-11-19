(function (root) {
  'use strict';
  const schoolDate = () => new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format();
  const clock = time => String(time || '').slice(0,5);
  const room = record => record.room_number ? 'Room '+record.room_number : 'Room pending';
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function field(parent,label,input) {
    const wrapper = element('label',label);
    wrapper.append(input);
    parent.append(wrapper);
  }
  function input(type,value) {
    const control = element('input');
    control.type = type;
    if (value) control.value = value;
    return control;
  }
  function option(select,key,label) {
    const row = element('option',label);
    row.value = key;
    select.append(row);
  }
  function action(parent,label,handler,className='ghost') {
    const button = element('button',label,className);
    button.type = 'button';
    if (handler) button.addEventListener('click',handler);
    parent.append(button);
    return button;
  }
  function status(parent) {
    const result = element('p');
    result.setAttribute('role','status');
    parent.append(result);
    return result;
  }

  function show(container, {admin, rpc, coverAi, active}) {
    container.replaceChildren();
    const frame = element('div');
    container.append(frame);
    const visible = () => active() && frame.isConnected;
    const message = status(frame);
    const formArea = element('div'), requestList = element('div'), planArea = element('div');
    frame.append(formArea,requestList,planArea);
    async function run(button, task) {
      if (button?.disabled || !visible()) return;
      if (button) button.disabled = true;
      message.textContent = '';
      try { await task(); }
      catch (error) { if (visible()) message.textContent = error.message || 'Could not update the school record.'; }
      finally { if (button?.isConnected) button.disabled = false; }
    }

    if (!admin) {
      const form = element('form',undefined,'formgrid two');
      const from = input('date',schoolDate()), to = input('date',schoolDate());
      from.required = to.required = true;
      from.min = to.min = schoolDate();
      const kind = element('select'), length = element('select');
      option(kind,'planned','Planned leave');
      option(kind,'emergency','Emergency leave');
      option(length,'full','Full day');
      option(length,'partial','Part of a day');
      const hours = element('div',undefined,'formgrid two hidden');
      const start = input('time'), end = input('time');
      field(hours,'Leave starts',start);
      field(hours,'Leave ends',end);
      from.addEventListener('change',()=>{
        to.min = from.value;
        if (to.value < from.value || length.value === 'partial') to.value = from.value;
      });
      length.addEventListener('change',()=>{
        const partial = length.value === 'partial';
        hours.classList.toggle('hidden',!partial);
        start.required = end.required = partial;
        if (partial) to.value = from.value;
        to.disabled = partial;
      });
      field(form,'Leave type',kind);
      field(form,'Duration',length);
      field(form,'From',from);
      field(form,'Through',to);
      form.append(hours);
      const reason = element('textarea');
      reason.required = true;
      reason.maxLength = 500;
      field(form,'Reason',reason);
      const submit = element('button','Request leave','primary');
      submit.type = 'submit';
      form.append(submit,message);
      const confirmation = element('dialog',undefined,'bn-email-dialog');
      confirmation.setAttribute('aria-label','Leave request sent');
      const confirmationContent = element('div',undefined,'bn-email-content');
      confirmationContent.append(element('h2','Leave request sent'),
        element('p','Awaiting approval. You can check the status under My requests.','bn-email-description'));
      const dismiss = action(confirmationContent,'OK',()=>{
        if (typeof confirmation.close==='function') confirmation.close();
        else confirmation.removeAttribute('open');
      },'primary');
      dismiss.autofocus = true;
      confirmation.append(confirmationContent);
      form.addEventListener('submit', e => {
        e.preventDefault();
        run(submit, async()=>{
          const partial = length.value === 'partial';
          const leaveKind = kind.value;
          try {
            const id = await rpc('bn_request_teacher_leave',{
              p_from:from.value,p_to:partial?from.value:to.value,p_start:partial?start.value:null,
              p_end:partial?end.value:null,p_kind:leaveKind,p_reason:reason.value.trim()
            });
            if (typeof id!=='string'||!id) throw Error('Could not confirm the request. Refresh My requests before trying again.');
          } catch (error) {
            if (!error.message?.includes('An overlapping leave request already exists')) throw error;
            if (visible()) message.textContent = 'Request not sent. A pending or approved leave overlaps these dates or times. Check My requests or choose a different date or time.';
            return;
          }
          if (!visible()) return;
          reason.value = '';
          const sent = leaveKind==='emergency' ? 'Emergency leave sent for priority review.' : 'Leave sent for approval.';
          message.textContent = sent;
          if (typeof confirmation.showModal==='function') confirmation.showModal();
          else { confirmation.setAttribute('open',''); dismiss.focus(); }
          try { await load(); }
          catch (_) { if (visible()) message.textContent = sent+' Use Refresh under My requests to update the list.'; }
        });
      });
      formArea.append(form,confirmation);
    }

    async function load() {
      const rows = await rpc('bn_list_teacher_leaves');
      if (!visible()) return;
      requestList.replaceChildren(element('h3',admin?'Leave requests':'My requests'));
      action(requestList,'Refresh',e=>run(e.currentTarget,load));
      if (!rows.length) requestList.append(element('p','No leave requests yet.','muted'));
      for (const row of rows) {
        const card = element('div',undefined,'panel');
        const descriptor = row.starts_at ? clock(row.starts_at)+'–'+clock(row.ends_at) :
          row.starts_on===row.ends_on ? 'Full day' : 'Through '+row.ends_on;
        card.append(element('strong', [admin?row.teacher_name:null,row.kind==='emergency'?'Emergency leave':'Planned leave'].filter(Boolean).join(' · ')),
          element('p',row.starts_on+' · '+descriptor+' · '+row.status),element('p',row.reason));
        if (row.status==='pending') {
          const controls = element('div',undefined,'row');
          const decide = (label,value)=>action(controls,label,e=>run(e.currentTarget,async()=>{
            await rpc('bn_review_teacher_leave',{p_leave:row.id,p_status:value});
            if (!visible()) return;
            message.textContent = value==='approved'?'Leave approved. Attendance now includes the leave.':'Leave '+value+'.';
            await load();
            if (value==='approved') await openPlan(row);
          }),value==='approved'?'primary':'ghost');
          if (admin) { decide('Approve','approved'); decide('Decline','declined'); }
          else decide('Withdraw request','cancelled');
          card.append(controls);
        } else if (admin && row.status==='approved') {
          action(card,'Plan cover',e=>run(e.currentTarget,()=>openPlan(row)));
        }
        requestList.append(card);
      }
    }

    async function openPlan(leave) {
      if (!visible()) return;
      planArea.replaceChildren(element('h3','Cover plan · '+leave.teacher_name));
      const preferred = [leave.starts_on,schoolDate()].sort().at(-1);
      const date = input('date',preferred>leave.ends_on ? leave.ends_on : preferred);
      date.min = leave.starts_on;
      date.max = leave.ends_on;
      field(planArea,'Cover date',date);
      const picks = element('div');
      let version = 0, instructions = [];
      async function renderPlan() {
        const requestVersion = ++version;
        const chosenDate = date.value;
        const rows = await rpc('bn_teacher_leave_cover_plan',{p_leave:leave.id,p_day:chosenDate});
        if (!visible() || !picks.isConnected || requestVersion!==version) return;
        picks.replaceChildren();
        if (!rows.length) { picks.append(element('p','No published periods affected on this date.')); return; }
        const selections = [];
        const now = new Date();
        for (const row of rows) {
          const card = element('div',undefined,'panel');
          const ends = new Date(chosenDate+'T'+clock(row.ends_at)+':00+05:30');
          card.append(element('strong',row.class_name+' · '+row.subject),
            element('p',clock(row.starts_at)+'–'+clock(row.ends_at)+' · '+room(row)));
          if (row.cover_needs_review) card.append(element('p','The previous cover became unavailable. Choose a new teacher.','notice'));
          const candidates = row.candidates || [];
          if (ends <= now) {
            card.append(element('p',row.cover_published_at?'Cover published':'Period has already ended.','muted'));
          } else {
            const select = element('select');
            option(select,'',row.teacher_id ? 'Leave unchanged' : 'Substitute needed');
            if (row.teacher_id) option(select,'remove','Remove cover assignment');
            for (const teacher of candidates) {
              option(select,teacher.teacher_id,teacher.teacher_name+' · '+teacher.periods+' scheduled · '+(teacher.subject_match?'Subject match':'Class teacher'));
            }
            if (row.cover_published_at) select.value = row.teacher_id;
            else if (candidates.length) select.value = candidates[0].teacher_id;
            if (!candidates.length) card.append(element('p','No suitable free teacher found.','muted'));
            if (candidates.length || row.teacher_id) field(card,'Cover teacher',select);
            const reason = element('p',undefined,'muted');
            card.append(reason);
            selections.push({select,reason,original:row.cover_published_at?row.teacher_id:null,slot_id:row.slot_id,class_id:row.class_id});
          }
          picks.append(card);
        }
        if (coverAi && selections.some(item=>item.select.options.length>1)) {
          const assistant = element('details');
          assistant.append(element('summary','Refine cover plan with AI'));
          const instruction = element('textarea');
          instruction.placeholder = 'For example: Neha ma’am ko sirf ek extra period do.';
          instruction.maxLength = 400;
          field(assistant,'Cover instructions',instruction);
          const feedback = status(assistant);
          action(assistant,'Apply instructions',event=>run(event.currentTarget,async()=>{
            const text=instruction.value.trim();
            if (!text) throw Error('Enter the cover instructions.');
            if (instructions.length>=8) throw Error('Reset the instructions to start a fresh draft.');
            const history=[...instructions,text];
            const answer=await coverAi({leave:leave.id,day:chosenDate,instructions:history});
            if (!visible() || requestVersion!==version) return;
            instructions=history;
            feedback.textContent=answer.question||answer.summary;
            instruction.value='';
            if (answer.question) return;
            for (const choice of answer.choices) {
              const slot=selections.find(s=>s.slot_id===choice.slot_id&&s.class_id===choice.class_id);
              if (!slot) continue;
              const id=choice.teacher_id||(slot.original?'remove':'');
              if ([...slot.select.options].some(option=>option.value===id)) {
                slot.select.value=id;
                slot.reason.textContent=choice.reason;
              }
            }
          }));
          action(assistant,'Reset instructions',()=>{ instructions=[]; run(null,renderPlan); });
          picks.append(assistant);
        }
        action(picks,'Publish cover',e=>run(e.currentTarget,async()=>{
          const choices = selections.filter(entry=>entry.select.value && entry.select.value!==entry.original)
            .map(({select,slot_id,class_id})=>({slot_id,class_id,teacher_id:select.value==='remove'?null:select.value}));
          if (!choices.length) throw Error('Change at least one cover assignment before publishing.');
          await rpc('bn_publish_teacher_covers',{p_leave:leave.id,p_day:chosenDate,p_covers:choices});
          if (visible()) message.textContent = 'Cover published to Teacher App.';
          await renderPlan();
        }),'primary');
      }
      const refresh = action(planArea,'Load affected periods',e=>run(e.currentTarget,renderPlan));
      date.addEventListener('change',()=>{ ++version; instructions=[]; picks.replaceChildren(); run(null,renderPlan); });
      planArea.append(picks);
      if (date.value) await renderPlan();
      refresh.focus();
    }
    return run(null,load);
  }

  function attendance(container,{rpc,active}) {
    container.replaceChildren();
    const month = input('month',schoolDate().slice(0,7));
    field(container,'Attendance month',month);
    const message = status(container), rows = element('div');
    container.append(rows);
    let version = 0;
    async function load() {
      if (!month.value) return;
      const attempt = ++version;
      const current = () => attempt===version && month.isConnected && active();
      rows.replaceChildren();
      message.textContent = 'Loading your attendance…';
      try {
        const result = await rpc('bn_teacher_attendance_month',{p_month:month.value+'-01'});
        if (!current()) return;
        const marks = result.rows || [];
        message.textContent = result.linked ? (marks.length ? '' : 'No attendance or approved leave recorded for this month.') :
          'Your ERP faculty profile needs to be linked by the school office to show staff attendance.';
        for (const mark of marks) {
          const card = element('div',undefined,'teacher-period');
          card.append(element('strong',mark.date),element('span',
            mark.status+(mark.approved_leave&&!mark.full_day&&mark.marked_status?' · '+mark.marked_status:'')));
          rows.append(card);
        }
      } catch (error) { if (current()) message.textContent = error.message || 'Attendance could not be loaded.'; }
    }
    action(container,'Refresh',load);
    month.addEventListener('change',load);
    return load();
  }
  const api = {schoolDate,show,attendance};
  if (typeof module!=='undefined' && module.exports) module.exports=api;
  else root.BNTeacherDuty=api;
})(typeof window!=='undefined'?window:globalThis);
