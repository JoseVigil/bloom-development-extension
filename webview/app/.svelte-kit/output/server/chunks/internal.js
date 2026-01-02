import{j as h,k as u,l as f}from"./svelte.js";import"clsx";import"./environment.js";let _={};function C(t){}function P(t){_=t}let g=null;function E(t){g=t}function O(t){}function v(t){const e=h(t),n=(r,{context:s,csp:o}={})=>{const i=u(t,{props:r,context:s,csp:o}),a=Object.defineProperties({},{css:{value:{code:"",map:null}},head:{get:()=>i.head},html:{get:()=>i.body},then:{value:(l,p)=>{{const d=l({css:a.css,head:a.head,html:a.html});return Promise.resolve(d)}}}});return a};return e.render=n,e}function y(t,e){t.component(n=>{let{stores:r,page:s,constructors:o,components:i=[],form:a,data_0:l=null,data_1:p=null}=e;f("__svelte__",r),r.page.set(s);const d=o[1];if(o[1]){n.push("<!--[-->");const c=o[0];n.push("<!---->"),c(n,{data:l,form:a,params:s.params,children:m=>{m.push("<!---->"),d(m,{data:p,form:a,params:s.params}),m.push("<!---->")},$$slots:{default:!0}}),n.push("<!---->")}else{n.push("<!--[!-->");const c=o[0];n.push("<!---->"),c(n,{data:l,form:a,params:s.params}),n.push("<!---->")}n.push("<!--]--> "),n.push("<!--[!-->"),n.push("<!--]-->")})}const b=v(y),j={app_template_contains_nonce:!1,async:!1,csp:{mode:"auto",directives:{"upgrade-insecure-requests":!1,"block-all-mixed-content":!1},reportOnly:{"upgrade-insecure-requests":!1,"block-all-mixed-content":!1}},csrf_check_origin:!0,csrf_trusted_origins:[],embedded:!1,env_public_prefix:"PUBLIC_",env_private_prefix:"",hash_routing:!1,hooks:null,preload_strategy:"modulepreload",root:b,service_worker:!1,service_worker_options:void 0,templates:{app:({head:t,body:e,assets:n,nonce:r,env:s})=>`<!DOCTYPE html>\r
<html lang="en">\r
<head>\r
  <meta charset="utf-8" />\r
  <meta name="viewport" content="width=device-width, initial-scale=1" />\r
  `+t+`\r
</head>\r
<body data-sveltekit-preload-data="hover">\r
  <div style="display: contents">`+e+`</div>\r
</body>\r
</html>`,error:({status:t,message:e})=>`<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<title>`+e+`</title>

		<style>
			body {
				--bg: white;
				--fg: #222;
				--divider: #ccc;
				background: var(--bg);
				color: var(--fg);
				font-family:
					system-ui,
					-apple-system,
					BlinkMacSystemFont,
					'Segoe UI',
					Roboto,
					Oxygen,
					Ubuntu,
					Cantarell,
					'Open Sans',
					'Helvetica Neue',
					sans-serif;
				display: flex;
				align-items: center;
				justify-content: center;
				height: 100vh;
				margin: 0;
			}

			.error {
				display: flex;
				align-items: center;
				max-width: 32rem;
				margin: 0 1rem;
			}

			.status {
				font-weight: 200;
				font-size: 3rem;
				line-height: 1;
				position: relative;
				top: -0.05rem;
			}

			.message {
				border-left: 1px solid var(--divider);
				padding: 0 0 0 1rem;
				margin: 0 0 0 1rem;
				min-height: 2.5rem;
				display: flex;
				align-items: center;
			}

			.message h1 {
				font-weight: 400;
				font-size: 1em;
				margin: 0;
			}

			@media (prefers-color-scheme: dark) {
				body {
					--bg: #222;
					--fg: #ddd;
					--divider: #666;
				}
			}
		</style>
	</head>
	<body>
		<div class="error">
			<span class="status">`+t+`</span>
			<div class="message">
				<h1>`+e+`</h1>
			</div>
		</div>
	</body>
</html>
`},version_hash:"137q09f"};async function q(){return{handle:void 0,handleFetch:void 0,handleError:void 0,handleValidationError:void 0,init:void 0,reroute:void 0,transport:void 0}}export{P as a,E as b,O as c,q as g,j as o,_ as p,g as r,C as s};
