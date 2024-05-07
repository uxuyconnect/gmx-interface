export default function UiPage() {
  return (
    <main className="mx-auto max-w-prose p-20">
      <h1 className="text-34 font-bold">UI Page</h1>
      <p>This page demonstrates the use of the UI components in the app.</p>

      <h2 className="mb-16 mt-24 text-24 font-bold">Fill colors</h2>
      <div className="flex flex-col gap-8">
        <div>
          blue
          <div className="flex w-fit overflow-hidden rounded-4 border *:size-64">
            <div className="bg-blue-100">100</div>
            <div className="bg-blue-500">500</div>
          </div>
        </div>
        <div>
          gray
          <div className="flex gap-8">
            <div className=" size-64 self-center rounded-4 bg-gray-200" />
            <div className="size-64 self-center rounded-4 bg-gray" />
          </div>
        </div>
        <div>
          slate
          <div className="flex w-fit overflow-hidden rounded-4 border *:size-64">
            <div className="bg-slate-500">500</div>
            <div className="bg-slate-600">600</div>
            <div className="bg-slate-700">700</div>
            <div className="bg-slate-800">800</div>
            <div className="bg-slate-850">850</div>
            <div className="bg-slate-900">900</div>
          </div>
        </div>
        <div>
          yellow
          <div className="size-64 self-center rounded-4 bg-yellow" />
        </div>
        <div>
          red
          <div className="size-64 self-center rounded-4 bg-red" />
        </div>
        <div>
          green
          <div className="size-64 self-center rounded-4 bg-green" />
        </div>
      </div>

      <h2 className="mb-16 mt-24 text-24 font-bold">Text colors</h2>

      <div className="flex gap-16">
        <p className="text-blue-500">Blue text is blue</p>
        <p className="text-gray">Gray text is gray</p>
        <p className="text-yellow">Yellow text is yellow</p>
        <p className="text-red">Red text is red</p>
        <p className="text-green">Green text is green</p>
        <p className="text-white">White text is white</p>
      </div>

      <h2 className="mb-16 mt-24 text-24 font-bold">Font sizes</h2>
      <div className="flex flex-col gap-16">
        <div className="flex items-baseline gap-8">
          <div>xl</div>
          <p className="text-34">Some very important title</p>
        </div>
        <div className="flex items-baseline gap-8">
          <div>lg</div>
          <p className="text-24">Not that important title</p>
        </div>
        <div className="flex items-baseline gap-8">
          <div>md</div>
          <p className="text-16">Some important text indeed</p>
        </div>
        <div className="flex items-baseline gap-8">
          <div>base</div>
          <p className="text-15">Base text it is. Nothing special</p>
        </div>
        <div className="flex items-baseline gap-8">
          <div>sm</div>
          <p className="text-14">Somewhat unimportant text, but still readable</p>
        </div>

        <div className="flex items-baseline gap-8">
          <div>&lt;unset&gt;</div>
          <p>Text with no size set</p>
        </div>
      </div>

      <h2 className="mb-16 mt-24 text-24 font-bold">Line heights</h2>
      <div className="flex flex-col gap-16">
        <p className="leading-1">
          leading-1
          <br />
          Lorem ipsum dolor sit amet consectetur adipisicing elit. Temporibus beatae atque eligendi sunt quasi et porro
          nemo cumque nesciunt dolorum earum, minus fuga similique exercitationem ad. Eos omnis vitae suscipit
          recusandae iste adipisci quasi rem odio, quidem qui modi impedit quibusdam culpa nemo distinctio rerum tempora
          sequi facilis quaerat laudantium pariatur dicta ab. Pariatur mollitia magni consectetur praesentium nulla
          nobis non voluptates laborum obcaecati enim unde, in tempore voluptas, expedita aut corrupti ipsum sequi
          consequatur iste corporis quasi! Officia nihil pariatur, asperiores molestiae quia earum tempora, in neque
          inventore quisquam dolore veniam minus beatae adipisci quod hic? Saepe, aperiam consequuntur!
        </p>
        <p className="leading-base">
          leading-base
          <br />
          Lorem ipsum dolor sit amet consectetur adipisicing elit. Temporibus beatae atque eligendi sunt quasi et porro
          nemo cumque nesciunt dolorum earum, minus fuga similique exercitationem ad. Eos omnis vitae suscipit
          recusandae iste adipisci quasi rem odio, quidem qui modi impedit quibusdam culpa nemo distinctio rerum tempora
          sequi facilis quaerat laudantium pariatur dicta ab. Pariatur mollitia magni consectetur praesentium nulla
          nobis non voluptates laborum obcaecati enim unde, in tempore voluptas, expedita aut corrupti ipsum sequi
          consequatur iste corporis quasi! Officia nihil pariatur, asperiores molestiae quia earum tempora, in neque
          inventore quisquam dolore veniam minus beatae adipisci quod hic? Saepe, aperiam consequuntur!
        </p>
      </div>
    </main>
  );
}
